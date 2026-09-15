import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresGoogleCalendarConnectionStore } from './google-calendar-connection-store.js';
import { createPostgresGoogleCalendarSyncStore } from './google-calendar-sync-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts075_legacy_${randomUUID().replaceAll('-', '')}`;
const databaseUrl =
  `postgresql://${postgresUser}:${postgresPassword}` + `@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl =
  `postgresql://${postgresUser}:${postgresPassword}` + `@127.0.0.1:${postgresPort}/postgres`;
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
    [`mts075-legacy-${randomUUID()}`],
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
  const consumed = await store.consumeOAuthState(stateHash, new Date('2026-09-14T13:00:00.000Z'));
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

async function insertTimedMission(accountId: string): Promise<string> {
  const seriesId = randomUUID();
  const occurrenceId = randomUUID();
  await pool.query(
    `INSERT INTO mission_series (id, account_id, title)
     VALUES ($1, $2, 'Created while legacy-disconnected')`,
    [seriesId, accountId],
  );
  await pool.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day,
       calendar_source, field_ownership, synchronization_state, updated_at
     ) VALUES (
       $1, $2, $3, '2026-09-17', '2026-09-17T09:00:00', '2026-09-17T10:00:00',
       '2026-09-17T01:00:00.000Z', '2026-09-17T02:00:00.000Z', 'Asia/Hong_Kong',
       'fixed_instant', false, 'internal', 'app_owned', 'synced', now()
     )`,
    [occurrenceId, accountId, seriesId],
  );
  return occurrenceId;
}

describe('MTS-075 legacy disconnected reconnect cutoff', () => {
  it('establishes a fresh cutoff when reconnecting a migrated disconnected row with no prior cutoff', async () => {
    const accountId = await createAccount();
    const store = createPostgresGoogleCalendarConnectionStore(pool);
    const first = await connectCalendar(accountId, 'e'.repeat(64));

    await store.disconnectConnection(accountId, first.id);
    await store.clearDisconnectedRefreshToken(accountId, first.id);
    await pool.query(
      `UPDATE external_calendar_connections
          SET provider_command_cutoff_at = NULL
        WHERE id = $1`,
      [first.id],
    );

    const disconnectedMissionId = await insertTimedMission(accountId);
    const second = await connectCalendar(accountId, 'f'.repeat(64));
    expect(second.id).toBe(first.id);

    const cutoff = await pool.query<{ providerCommandCutoffAt: Date | null }>(
      `SELECT provider_command_cutoff_at AS "providerCommandCutoffAt"
         FROM external_calendar_connections
        WHERE id = $1`,
      [first.id],
    );
    expect(cutoff.rows[0]?.providerCommandCutoffAt).not.toBeNull();

    const syncStore = createPostgresGoogleCalendarSyncStore(pool);
    const pendingIds = new Set(
      (await syncStore.listPendingCommands(first.id)).map((item) => item.occurrenceId),
    );
    expect(pendingIds).not.toContain(disconnectedMissionId);
  });
});
