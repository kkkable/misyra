import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresGoogleCalendarConnectionStore } from './google-calendar-connection-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts075_initial_${randomUUID().replaceAll('-', '')}`;
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

describe('MTS-075 initial connection cutoff', () => {
  it('keeps the command cutoff empty on a first connection so initial app-owned missions stay eligible', async () => {
    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (provider, provider_subject)
         VALUES ('google', $1)
         RETURNING id`,
      [`mts075-initial-${randomUUID()}`],
    );
    const accountId = account.rows[0]?.id;
    if (accountId === undefined) throw new Error('account insert returned no id');

    const store = createPostgresGoogleCalendarConnectionStore(pool);
    await store.saveOAuthState({
      accountId,
      stateHash: '1'.repeat(64),
      expiresAt: new Date('2026-09-14T14:00:00.000Z'),
      consumedAt: null,
      initialSyncDirection: 'misyra_to_external',
      selectedCalendarId: 'calendar-1',
    });

    const stateHash = '2'.repeat(64);
    await store.saveOAuthState({
      accountId,
      stateHash,
      expiresAt: new Date('2026-09-14T14:00:00.000Z'),
      consumedAt: null,
      initialSyncDirection: 'misyra_to_external',
      selectedCalendarId: 'calendar-1',
    });
    const consumed = await store.consumeOAuthState(stateHash, new Date('2026-09-14T13:00:00.000Z'));
    expect(consumed).not.toBeNull();

    await store.createConnection({
      accountId,
      provider: 'google',
      providerCalendarId: 'calendar-1',
      initialSyncDirection: 'misyra_to_external',
      encryptedRefreshToken: 'encrypted-initial',
      state: 'connected',
    });

    const cutoff = await pool.query<{ providerCommandCutoffAt: Date | null }>(
      `SELECT provider_command_cutoff_at AS "providerCommandCutoffAt"
           FROM external_calendar_connections
          WHERE account_id = $1`,
      [accountId],
    );
    expect(cutoff.rows[0]?.providerCommandCutoffAt).toBeNull();
  });
});
