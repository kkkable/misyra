import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresGoogleCalendarSyncStore } from './google-calendar-sync-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts070_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;
let pool: Pool;

beforeAll(async () => {
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();
  await applyMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

async function createAccount(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO accounts (provider, provider_subject)
     VALUES ('google', $1)
     RETURNING id`,
    [`mts070-${randomUUID()}`],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('account insert returned no id');
  return id;
}

async function createConnection(
  accountId: string,
  direction: 'external_to_misyra' | 'misyra_to_external' = 'external_to_misyra',
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO external_calendar_connections (
       account_id, provider, sync_direction, provider_calendar_id,
       encrypted_refresh_token, connection_state
     ) VALUES ($1, 'google', $2, 'calendar-1', 'encrypted-token', 'connected')
     RETURNING id`,
    [accountId, direction],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('connection insert returned no id');
  return id;
}

function providerEvent(
  overrides: Partial<{
    providerUpdatedAt: string;
    title: string;
    startInstant: string;
    finishInstant: string;
  }> = {},
) {
  return {
    providerCalendarId: 'calendar-1',
    providerEventId: 'provider-event-1',
    providerUpdatedAt: overrides.providerUpdatedAt ?? '2026-09-13T02:00:00.000Z',
    title: overrides.title ?? 'Provider event',
    schedule: {
      type: 'timed' as const,
      startInstant: overrides.startInstant ?? '2026-09-15T01:00:00.000Z',
      finishInstant: overrides.finishInstant ?? '2026-09-15T02:00:00.000Z',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'fixed_instant' as const,
    },
    recurrence: null,
    location: 'Central',
    providerNotes: 'Provider note',
    status: 'confirmed' as const,
    ownership: 'app_owned' as const,
  };
}

describe('MTS-070 PostgreSQL Google calendar synchronization store', () => {
  it('reuses retained provider IDs during full resync instead of duplicating missions', async () => {
    const accountId = await createAccount();
    const connectionId = await createConnection(accountId);
    const store = createPostgresGoogleCalendarSyncStore(pool, {
      now: () => new Date('2026-09-13T03:00:00.000Z'),
    });

    await store.reconcileFullImport(connectionId, {
      events: [providerEvent()],
      cursor: 'sync-token-first',
    });
    await store.reconcileFullImport(connectionId, {
      events: [providerEvent({ title: 'Same provider ID, refreshed title' })],
      cursor: 'sync-token-second',
    });

    const counts = await pool.query<{ occurrences: string; links: string }>(
      `SELECT
         (SELECT count(*) FROM mission_occurrences WHERE account_id = $1)::text AS occurrences,
         (SELECT count(*) FROM external_event_links WHERE connection_id = $2)::text AS links`,
      [accountId, connectionId],
    );
    expect(counts.rows[0]).toEqual({ occurrences: '1', links: '1' });

    const persisted = await pool.query<{ title: string; cursor: string }>(
      `SELECT ms.title, c.cursor
         FROM external_event_links l
         JOIN mission_occurrences mo ON mo.id = l.occurrence_id
         JOIN mission_series ms ON ms.id = mo.series_id
         JOIN calendar_sync_cursors c ON c.connection_id = l.connection_id
        WHERE l.connection_id = $1 AND l.provider_event_id = 'provider-event-1'`,
      [connectionId],
    );
    expect(persisted.rows[0]).toEqual({
      title: 'Same provider ID, refreshed title',
      cursor: 'sync-token-second',
    });
  });

  it('freezes completed imported missions while still advancing the durable cursor', async () => {
    const accountId = await createAccount();
    const connectionId = await createConnection(accountId);
    const store = createPostgresGoogleCalendarSyncStore(pool, {
      now: () => new Date('2026-09-13T03:00:00.000Z'),
    });
    await store.reconcileFullImport(connectionId, {
      events: [providerEvent()],
      cursor: 'sync-token-initial',
    });

    await pool.query(
      `UPDATE mission_occurrences
          SET completion_state = 'completed'
        WHERE id = (
          SELECT occurrence_id FROM external_event_links
           WHERE connection_id = $1 AND provider_event_id = 'provider-event-1'
        )`,
      [connectionId],
    );

    await store.applyProviderChanges(connectionId, {
      changes: [
        {
          type: 'upsert',
          event: providerEvent({
            providerUpdatedAt: '2026-09-13T04:00:00.000Z',
            title: 'Provider changed after completion',
            startInstant: '2026-09-16T01:00:00.000Z',
            finishInstant: '2026-09-16T02:00:00.000Z',
          }),
        },
      ],
      cursor: 'sync-token-after-completion',
    });

    const persisted = await pool.query<{
      title: string;
      startInstant: Date;
      completionState: string;
      cursor: string;
    }>(
      `SELECT ms.title,
              mo.start_instant AS "startInstant",
              mo.completion_state AS "completionState",
              c.cursor
         FROM external_event_links l
         JOIN mission_occurrences mo ON mo.id = l.occurrence_id
         JOIN mission_series ms ON ms.id = mo.series_id
         JOIN calendar_sync_cursors c ON c.connection_id = l.connection_id
        WHERE l.connection_id = $1 AND l.provider_event_id = 'provider-event-1'`,
      [connectionId],
    );
    expect(persisted.rows[0]).toEqual({
      title: 'Provider event',
      startInstant: new Date('2026-09-15T01:00:00.000Z'),
      completionState: 'completed',
      cursor: 'sync-token-after-completion',
    });
  });

  it('keeps a newer valid local pending edit, then accepts a later provider edit', async () => {
    const accountId = await createAccount();
    const connectionId = await createConnection(accountId);
    const store = createPostgresGoogleCalendarSyncStore(pool, {
      now: () => new Date('2026-09-13T03:00:00.000Z'),
    });
    await store.reconcileFullImport(connectionId, {
      events: [providerEvent()],
      cursor: 'sync-token-initial',
    });

    const linked = await pool.query<{ occurrenceId: string; seriesId: string }>(
      `SELECT mo.id AS "occurrenceId", mo.series_id AS "seriesId"
         FROM external_event_links l
         JOIN mission_occurrences mo ON mo.id = l.occurrence_id
        WHERE l.connection_id = $1 AND l.provider_event_id = 'provider-event-1'`,
      [connectionId],
    );
    const occurrenceId = linked.rows[0]?.occurrenceId;
    const seriesId = linked.rows[0]?.seriesId;
    if (!occurrenceId || !seriesId) throw new Error('expected imported occurrence');

    const device = await pool.query<{ id: string }>(
      `INSERT INTO devices (
         account_id, installation_id, platform, app_version, notification_capability
       ) VALUES ($1, $2, 'ios', '1.0.0', 'authorized')
       RETURNING id`,
      [accountId, `mts070-device-${randomUUID()}`],
    );
    const deviceId = device.rows[0]?.id;
    if (!deviceId) throw new Error('device insert returned no id');

    await pool.query(`UPDATE mission_series SET title = 'Local newer title' WHERE id = $1`, [seriesId]);
    await pool.query(
      `UPDATE mission_occurrences
          SET synchronization_state = 'pending', version = version + 1
        WHERE id = $1`,
      [occurrenceId],
    );
    await pool.query(
      `INSERT INTO device_sync_mutations (
         id, account_id, device_id, entity_type, entity_id, operation,
         base_version, client_occurred_at, server_receipt_time, effective_time,
         validation_result, payload
       ) VALUES ($1, $2, $3, 'mission_occurrence', $4, 'update', 1,
                 $5, $5, $5, 'accepted', '{}'::jsonb)`,
      [randomUUID(), accountId, deviceId, occurrenceId, new Date('2026-09-13T04:00:00.000Z')],
    );

    await store.applyProviderChanges(connectionId, {
      changes: [
        {
          type: 'upsert',
          event: providerEvent({
            providerUpdatedAt: '2026-09-13T03:30:00.000Z',
            title: 'Provider older title',
          }),
        },
      ],
      cursor: 'sync-token-provider-older',
    });

    let state = await pool.query<{ title: string; syncState: string }>(
      `SELECT ms.title, mo.synchronization_state AS "syncState"
         FROM mission_occurrences mo JOIN mission_series ms ON ms.id = mo.series_id
        WHERE mo.id = $1`,
      [occurrenceId],
    );
    expect(state.rows[0]).toEqual({ title: 'Local newer title', syncState: 'pending' });

    await store.applyProviderChanges(connectionId, {
      changes: [
        {
          type: 'upsert',
          event: providerEvent({
            providerUpdatedAt: '2026-09-13T04:30:00.000Z',
            title: 'Provider newest title',
          }),
        },
      ],
      cursor: 'sync-token-provider-newest',
    });

    state = await pool.query<{ title: string; syncState: string }>(
      `SELECT ms.title, mo.synchronization_state AS "syncState"
         FROM mission_occurrences mo JOIN mission_series ms ON ms.id = mo.series_id
        WHERE mo.id = $1`,
      [occurrenceId],
    );
    expect(state.rows[0]).toEqual({ title: 'Provider newest title', syncState: 'synced' });
  });

  it('clears only the invalid cursor so a controlled full resync can reuse retained links', async () => {
    const accountId = await createAccount();
    const connectionId = await createConnection(accountId);
    const store = createPostgresGoogleCalendarSyncStore(pool);
    await pool.query(
      `INSERT INTO calendar_sync_cursors (connection_id, cursor) VALUES ($1, 'expired-token')`,
      [connectionId],
    );

    await store.clearCursor(connectionId);

    const cursor = await pool.query(`SELECT cursor FROM calendar_sync_cursors WHERE connection_id = $1`, [
      connectionId,
    ]);
    expect(cursor.rowCount).toBe(0);
    const connection = await pool.query<{ state: string }>(
      `SELECT connection_state AS state FROM external_calendar_connections WHERE id = $1`,
      [connectionId],
    );
    expect(connection.rows[0]?.state).toBe('connected');
  });
});
