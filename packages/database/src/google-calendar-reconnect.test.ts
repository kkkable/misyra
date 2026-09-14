import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresGoogleCalendarConnectionStore } from './google-calendar-connection-store.js';
import { createPostgresGoogleCalendarSyncStore } from './google-calendar-sync-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts075_${randomUUID().replaceAll('-', '')}`;
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
    [`mts075-${randomUUID()}`],
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error('account insert returned no id');
  return id;
}

async function connectCalendar(accountId: string, stateHash: string) {
  const store = createPostgresGoogleCalendarConnectionStore(pool);
  await store.saveOAuthState({
    accountId,
    stateHash,
    expiresAt: new Date('2026-09-14T14:00:00.000Z'),
    consumedAt: null,
    initialSyncDirection: 'external_to_misyra',
    selectedCalendarId: 'calendar-1',
  });
  const consumed = await store.consumeOAuthState(
    stateHash,
    new Date('2026-09-14T13:00:00.000Z'),
  );
  if (consumed === null) throw new Error('OAuth state was not consumable');
  return store.createConnection({
    accountId,
    provider: 'google',
    providerCalendarId: 'calendar-1',
    initialSyncDirection: 'external_to_misyra',
    encryptedRefreshToken: `encrypted-${stateHash.slice(0, 4)}`,
    state: 'connected',
  });
}

async function insertTimedMission(input: {
  accountId: string;
  title: string;
  startInstant: string;
  finishInstant: string;
  synchronizationState?: 'synced' | 'pending';
}): Promise<string> {
  const seriesId = randomUUID();
  const occurrenceId = randomUUID();
  await pool.query(
    `INSERT INTO mission_series (id, account_id, title)
     VALUES ($1, $2, $3)`,
    [seriesId, input.accountId, input.title],
  );
  await pool.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day,
       calendar_source, field_ownership, synchronization_state
     ) VALUES (
       $1, $2, $3, ($4::timestamptz AT TIME ZONE 'Asia/Hong_Kong')::date,
       to_char($4::timestamptz AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD"T"HH24:MI:SS'),
       to_char($5::timestamptz AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD"T"HH24:MI:SS'),
       $4, $5, 'Asia/Hong_Kong', 'fixed_instant', false,
       'internal', 'app_owned', $6
     )`,
    [
      occurrenceId,
      input.accountId,
      seriesId,
      input.startInstant,
      input.finishInstant,
      input.synchronizationState ?? 'synced',
    ],
  );
  return occurrenceId;
}

function providerEvent(providerEventId: string, title: string) {
  return {
    providerCalendarId: 'calendar-1',
    providerEventId,
    providerUpdatedAt: '2026-09-14T13:30:00.000Z',
    title,
    schedule: {
      type: 'timed' as const,
      startInstant: '2026-09-16T01:00:00.000Z',
      finishInstant: '2026-09-16T02:00:00.000Z',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'fixed_instant' as const,
    },
    recurrence: null,
    location: null,
    providerNotes: null,
    status: 'confirmed' as const,
    ownership: 'app_owned' as const,
  };
}

describe('MTS-075 disconnect queue discard and same-calendar reconnect', () => {
  it('keeps internal data and retained provider ids while discarding all delayed provider work', async () => {
    const accountId = await createAccount();
    const connectionStore = createPostgresGoogleCalendarConnectionStore(pool);
    const connection = await connectCalendar(accountId, 'a'.repeat(64));
    const linkedOccurrenceId = await insertTimedMission({
      accountId,
      title: 'Linked pending edit',
      startInstant: '2026-09-16T01:00:00.000Z',
      finishInstant: '2026-09-16T02:00:00.000Z',
      synchronizationState: 'pending',
    });
    await pool.query(
      `INSERT INTO external_event_links
         (connection_id, occurrence_id, provider_event_id, recurrence_scope)
       VALUES ($1, $2, 'provider-linked-event', 'event')`,
      [connection.id, linkedOccurrenceId],
    );
    await pool.query(
      `INSERT INTO calendar_sync_cursors (connection_id, cursor)
       VALUES ($1, 'cursor-before-disconnect')`,
      [connection.id],
    );
    await pool.query(
      `INSERT INTO misyra_internal.google_calendar_watch_channels
         (channel_id, connection_id, resource_id, token_hash, expires_at)
       VALUES ('channel-before-disconnect', $1, 'resource-1', $2, '2026-09-15T00:00:00.000Z')`,
      [connection.id, 'a'.repeat(64)],
    );

    await connectionStore.disconnectConnection(accountId, connection.id);

    const disconnected = await pool.query<{ state: string }>(
      `SELECT connection_state AS state
         FROM external_calendar_connections
        WHERE id = $1`,
      [connection.id],
    );
    expect(disconnected.rows[0]?.state).toBe('disconnected');
    await expect(
      pool.query(`SELECT id FROM mission_occurrences WHERE id = $1`, [linkedOccurrenceId]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query(
        `SELECT provider_event_id
           FROM external_event_links
          WHERE connection_id = $1 AND occurrence_id = $2`,
        [connection.id, linkedOccurrenceId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query(`SELECT cursor FROM calendar_sync_cursors WHERE connection_id = $1`, [
        connection.id,
      ]),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      pool.query(
        `SELECT channel_id
           FROM misyra_internal.google_calendar_watch_channels
          WHERE connection_id = $1`,
        [connection.id],
      ),
    ).resolves.toMatchObject({ rowCount: 0 });

    await connectionStore.clearDisconnectedRefreshToken(accountId, connection.id);

    const disconnectedOccurrenceId = await insertTimedMission({
      accountId,
      title: 'Created while disconnected',
      startInstant: '2026-09-17T01:00:00.000Z',
      finishInstant: '2026-09-17T02:00:00.000Z',
    });

    const reconnected = await connectCalendar(accountId, 'b'.repeat(64));
    expect(reconnected.id).toBe(connection.id);

    const syncStore = createPostgresGoogleCalendarSyncStore(pool);
    const pendingAfterReconnect = await syncStore.listPendingCommands(connection.id);
    expect(pendingAfterReconnect).toEqual([]);

    const retained = await pool.query<{ providerEventId: string }>(
      `SELECT provider_event_id AS "providerEventId"
         FROM external_event_links
        WHERE connection_id = $1 AND occurrence_id = $2`,
      [connection.id, linkedOccurrenceId],
    );
    expect(retained.rows[0]?.providerEventId).toBe('provider-linked-event');

    await syncStore.reconcileFullImport(connection.id, {
      events: [providerEvent('provider-linked-event', 'Provider title after reconnect')],
      cursor: 'cursor-after-reconnect',
    });
    const counts = await pool.query<{ occurrences: string; links: string }>(
      `SELECT
         (SELECT count(*) FROM mission_occurrences WHERE account_id = $1)::text AS occurrences,
         (SELECT count(*) FROM external_event_links WHERE connection_id = $2)::text AS links`,
      [accountId, connection.id],
    );
    expect(counts.rows[0]).toEqual({ occurrences: '2', links: '1' });

    await pool.query(
      `UPDATE mission_occurrences
          SET synchronization_state = 'pending', updated_at = now() + interval '1 minute'
        WHERE id = $1`,
      [linkedOccurrenceId],
    );
    const postReconnectOccurrenceId = await insertTimedMission({
      accountId,
      title: 'Created after reconnect',
      startInstant: '2026-09-18T01:00:00.000Z',
      finishInstant: '2026-09-18T02:00:00.000Z',
    });
    await pool.query(
      `UPDATE mission_occurrences
          SET updated_at = now() + interval '2 minutes'
        WHERE id = $1`,
      [postReconnectOccurrenceId],
    );

    const pendingAfterNewChanges = await syncStore.listPendingCommands(connection.id);
    const queuedOccurrenceIds = new Set(pendingAfterNewChanges.map((item) => item.occurrenceId));
    expect(queuedOccurrenceIds).toContain(linkedOccurrenceId);
    expect(queuedOccurrenceIds).toContain(postReconnectOccurrenceId);
    expect(queuedOccurrenceIds).not.toContain(disconnectedOccurrenceId);
  });
});
