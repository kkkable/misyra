import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresGoogleCalendarSyncStore } from './google-calendar-sync-store.js';
import { applyMigrations } from './migrations.js';
import { createPostgresSyncStore } from './sync-store.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts072_${randomUUID().replaceAll('-', '')}`;
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

async function createImportedOrganizerMission() {
  const accountResult = await pool.query<{ id: string }>(
    `INSERT INTO accounts (provider, provider_subject)
     VALUES ('google', $1)
     RETURNING id`,
    [`mts072-${randomUUID()}`],
  );
  const accountId = accountResult.rows[0]?.id;
  if (accountId === undefined) throw new Error('account insert returned no id');

  const deviceResult = await pool.query<{ id: string }>(
    `INSERT INTO devices (
       account_id, installation_id, platform, app_version, notification_capability
     ) VALUES ($1, $2, 'ios', '1.0.0', 'authorized')
     RETURNING id`,
    [accountId, `mts072-device-${randomUUID()}`],
  );
  const deviceId = deviceResult.rows[0]?.id;
  if (deviceId === undefined) throw new Error('device insert returned no id');

  const connectionResult = await pool.query<{ id: string }>(
    `INSERT INTO external_calendar_connections (
       account_id, provider, sync_direction, provider_calendar_id,
       encrypted_refresh_token, connection_state
     ) VALUES ($1, 'google', 'external_to_misyra', 'calendar-1', 'encrypted-token', 'connected')
     RETURNING id`,
    [accountId],
  );
  const connectionId = connectionResult.rows[0]?.id;
  if (connectionId === undefined) throw new Error('connection insert returned no id');

  const googleStore = createPostgresGoogleCalendarSyncStore(pool, {
    now: () => new Date('2026-09-13T10:00:00.000Z'),
  });
  await googleStore.reconcileFullImport(connectionId, {
    events: [
      {
        providerCalendarId: 'calendar-1',
        providerEventId: 'organizer-event-1',
        providerUpdatedAt: '2026-09-13T09:00:00.000Z',
        title: 'Organizer meeting',
        schedule: {
          type: 'timed',
          startInstant: '2026-09-15T01:00:00.000Z',
          finishInstant: '2026-09-15T02:00:00.000Z',
          timeZone: 'Asia/Hong_Kong',
          timeBehavior: 'fixed_instant',
        },
        recurrence: null,
        location: 'Central',
        providerNotes: 'Organizer agenda',
        status: 'confirmed',
        ownership: 'organizer_controlled',
      },
    ],
    cursor: 'cursor-initial',
  });

  const linked = await pool.query<{ occurrenceId: string }>(
    `SELECT occurrence_id AS "occurrenceId"
       FROM external_event_links
      WHERE connection_id = $1 AND provider_event_id = 'organizer-event-1'`,
    [connectionId],
  );
  const occurrenceId = linked.rows[0]?.occurrenceId;
  if (occurrenceId === undefined) throw new Error('imported occurrence missing');

  return { accountId, deviceId, connectionId, occurrenceId, googleStore };
}

describe('MTS-072 organizer personal-note server synchronization', () => {
  it('syncs the app-only note without creating a provider command and preserves it across organizer updates', async () => {
    const { accountId, deviceId, connectionId, occurrenceId, googleStore } =
      await createImportedOrganizerMission();
    const cursorResult = await pool.query<{ cursor: string }>(
      `SELECT coalesce(max(sequence), 0)::text AS cursor
         FROM account_change_log
        WHERE account_id = $1`,
      [accountId],
    );
    const cursorBeforeNote = Number(cursorResult.rows[0]?.cursor ?? '0');
    const syncStore = createPostgresSyncStore(pool, () => new Date('2026-09-13T10:05:00.000Z'));
    const mutationId = randomUUID();

    await expect(
      syncStore.push(accountId, [
        {
          mutationId,
          accountId,
          deviceId,
          entityType: 'mission_personal_note',
          entityId: occurrenceId,
          operation: 'update',
          baseVersion: null,
          clientOccurredAt: '2026-09-13T10:05:00.000Z',
          payload: { note: 'Ask privately about access' },
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [mutationId] });

    expect(
      await pool.query(
        `SELECT note FROM mission_personal_notes
          WHERE occurrence_id = $1 AND account_id = $2`,
        [occurrenceId, accountId],
      ),
    ).toMatchObject({ rows: [{ note: 'Ask privately about access' }] });

    const noteChanges = await syncStore.pull(accountId, { cursor: cursorBeforeNote, limit: 25 });
    expect(noteChanges.kind).toBe('incremental');
    if (noteChanges.kind !== 'incremental') throw new Error('expected incremental note sync');
    expect(noteChanges.changes).toEqual([
      expect.objectContaining({
        entityType: 'mission_personal_note',
        entityId: occurrenceId,
        operation: 'upsert',
        payload: { note: 'Ask privately about access' },
      }),
    ]);

    await expect(googleStore.listPendingCommands(connectionId)).resolves.toEqual([]);

    await googleStore.applyProviderChanges(connectionId, {
      changes: [
        {
          type: 'upsert',
          event: {
            providerCalendarId: 'calendar-1',
            providerEventId: 'organizer-event-1',
            providerUpdatedAt: '2026-09-13T10:10:00.000Z',
            title: 'Organizer changed title',
            schedule: {
              type: 'timed',
              startInstant: '2026-09-15T03:00:00.000Z',
              finishInstant: '2026-09-15T04:30:00.000Z',
              timeZone: 'Asia/Hong_Kong',
              timeBehavior: 'fixed_instant',
            },
            recurrence: null,
            location: 'Admiralty',
            providerNotes: 'Updated organizer agenda',
            status: 'confirmed',
            ownership: 'organizer_controlled',
          },
        },
      ],
      cursor: 'cursor-updated',
    });

    const persisted = await pool.query<{
      title: string;
      location: string | null;
      providerNotes: string | null;
      personalNote: string | null;
    }>(
      `SELECT ms.title,
              mo.location,
              mo.notes AS "providerNotes",
              pn.note AS "personalNote"
         FROM mission_occurrences mo
         JOIN mission_series ms ON ms.id = mo.series_id
         LEFT JOIN mission_personal_notes pn
           ON pn.occurrence_id = mo.id AND pn.account_id = mo.account_id
        WHERE mo.id = $1 AND mo.account_id = $2`,
      [occurrenceId, accountId],
    );
    expect(persisted.rows[0]).toEqual({
      title: 'Organizer changed title',
      location: 'Admiralty',
      providerNotes: 'Updated organizer agenda',
      personalNote: 'Ask privately about access',
    });
    await expect(googleStore.listPendingCommands(connectionId)).resolves.toEqual([]);
  });
});
