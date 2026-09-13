import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresGoogleCalendarSyncStore } from './google-calendar-sync-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts070_initial_window_${randomUUID().replaceAll('-', '')}`;
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

async function createAccountAndConnection(): Promise<{
  accountId: string;
  connectionId: string;
}> {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO accounts (provider, provider_subject)
     VALUES ('google', $1)
     RETURNING id`,
    [`mts070-initial-window-${randomUUID()}`],
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error('account insert returned no id');

  const connection = await pool.query<{ id: string }>(
    `INSERT INTO external_calendar_connections (
       account_id, provider, sync_direction, provider_calendar_id,
       encrypted_refresh_token, connection_state
     ) VALUES ($1, 'google', 'misyra_to_external', 'calendar-1', 'encrypted-token', 'connected')
     RETURNING id`,
    [accountId],
  );
  const connectionId = connection.rows[0]?.id;
  if (!connectionId) throw new Error('connection insert returned no id');
  return { accountId, connectionId };
}

async function insertTimedMission(
  accountId: string,
  title: string,
  startInstant: string,
  finishInstant: string,
): Promise<void> {
  const seriesId = randomUUID();
  await pool.query(
    `INSERT INTO mission_series (id, account_id, title)
     VALUES ($1, $2, $3)`,
    [seriesId, accountId, title],
  );
  await pool.query(
    `INSERT INTO mission_occurrences (
       account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day
     ) VALUES (
       $1, $2, ($3::timestamptz AT TIME ZONE 'Asia/Hong_Kong')::date,
       to_char($3::timestamptz AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD"T"HH24:MI:SS'),
       to_char($4::timestamptz AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD"T"HH24:MI:SS'),
       $3, $4, 'Asia/Hong_Kong', 'fixed_instant', false
     )`,
    [accountId, seriesId, startInstant, finishInstant],
  );
}

describe('MTS-070 PostgreSQL initial migration window', () => {
  it('exports only unfinished future missions during Misyra-first initial migration', async () => {
    const { accountId, connectionId } = await createAccountAndConnection();
    await insertTimedMission(
      accountId,
      'Past local mission',
      '2026-09-12T01:00:00.000Z',
      '2026-09-12T02:00:00.000Z',
    );
    await insertTimedMission(
      accountId,
      'Future local mission',
      '2026-09-15T01:00:00.000Z',
      '2026-09-15T02:00:00.000Z',
    );
    const store = createPostgresGoogleCalendarSyncStore(pool, {
      now: () => new Date('2026-09-13T03:00:00.000Z'),
    });

    const initial = await store.listPendingCommands(connectionId, { initialMigration: true });
    const normal = await store.listPendingCommands(connectionId, { initialMigration: false });

    expect(
      initial.map(({ command }) => (command.operation === 'create' ? command.event.title : null)),
    ).toEqual(['Future local mission']);
    expect(
      normal.map(({ command }) => (command.operation === 'create' ? command.event.title : null)),
    ).toEqual(['Past local mission', 'Future local mission']);
  });
});
