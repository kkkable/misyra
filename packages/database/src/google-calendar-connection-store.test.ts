import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresGoogleCalendarConnectionStore } from './google-calendar-connection-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts069_${randomUUID().replaceAll('-', '')}`;
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

async function createAccount() {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO accounts (provider, provider_subject)
     VALUES ('google', $1)
     RETURNING id`,
    [`mts069-${randomUUID()}`],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('account insert returned no id');
  return id;
}

async function prepareConsumedOAuthState(
  store: ReturnType<typeof createPostgresGoogleCalendarConnectionStore>,
  input: {
    accountId: string;
    stateHash: string;
    initialSyncDirection: 'external_to_misyra' | 'misyra_to_external';
    selectedCalendarId: string | null;
  },
) {
  const currentTime = new Date('2026-09-12T15:00:00.000Z');
  await store.saveOAuthState({
    ...input,
    expiresAt: new Date('2026-09-12T15:10:00.000Z'),
    consumedAt: null,
  });
  const consumed = await store.consumeOAuthState(input.stateHash, currentTime);
  if (!consumed) throw new Error('expected OAuth state to be consumable');
}

describe('MTS-069 PostgreSQL Google calendar connection store', () => {
  it('atomically consumes bounded OAuth state once and rejects expiry', async () => {
    const store = createPostgresGoogleCalendarConnectionStore(pool);
    const accountId = await createAccount();
    const currentTime = new Date('2026-09-12T15:00:00.000Z');
    const stateHash = 'a'.repeat(64);

    await store.saveOAuthState({
      accountId,
      stateHash,
      expiresAt: new Date('2026-09-12T15:10:00.000Z'),
      consumedAt: null,
      initialSyncDirection: 'external_to_misyra',
      selectedCalendarId: 'selected-calendar',
    });

    await expect(store.consumeOAuthState(stateHash, currentTime)).resolves.toMatchObject({
      accountId,
      stateHash,
      consumedAt: currentTime,
      initialSyncDirection: 'external_to_misyra',
      selectedCalendarId: 'selected-calendar',
    });
    await expect(store.consumeOAuthState(stateHash, currentTime)).resolves.toBeNull();

    const expiredHash = 'b'.repeat(64);
    await store.saveOAuthState({
      accountId,
      stateHash: expiredHash,
      expiresAt: new Date('2026-09-12T14:59:59.999Z'),
      consumedAt: null,
      initialSyncDirection: 'misyra_to_external',
      selectedCalendarId: null,
    });
    await expect(store.consumeOAuthState(expiredHash, currentTime)).resolves.toBeNull();
  });

  it('persists the selected calendar and encrypted refresh token with one connection per account', async () => {
    const store = createPostgresGoogleCalendarConnectionStore(pool);
    const accountId = await createAccount();
    await prepareConsumedOAuthState(store, {
      accountId,
      stateHash: 'c'.repeat(64),
      initialSyncDirection: 'external_to_misyra',
      selectedCalendarId: 'selected-calendar',
    });

    const connection = await store.createConnection({
      accountId,
      provider: 'google',
      providerCalendarId: 'selected-calendar',
      initialSyncDirection: 'external_to_misyra',
      encryptedRefreshToken: 'ciphertext-only',
      state: 'connected',
    });

    expect(connection).toMatchObject({
      accountId,
      provider: 'google',
      providerCalendarId: 'selected-calendar',
      initialSyncDirection: 'external_to_misyra',
      encryptedRefreshToken: 'ciphertext-only',
      state: 'connected',
    });

    const persisted = await pool.query<{
      providerCalendarId: string | null;
      encryptedRefreshToken: string | null;
      connectionState: string;
      oauthStateHash: string | null;
    }>(
      `SELECT provider_calendar_id AS "providerCalendarId",
              encrypted_refresh_token AS "encryptedRefreshToken",
              connection_state AS "connectionState",
              oauth_state_hash AS "oauthStateHash"
         FROM external_calendar_connections
        WHERE id = $1`,
      [connection.id],
    );
    expect(persisted.rows[0]).toEqual({
      providerCalendarId: 'selected-calendar',
      encryptedRefreshToken: 'ciphertext-only',
      connectionState: 'connected',
      oauthStateHash: null,
    });

    await expect(
      store.createConnection({
        accountId,
        provider: 'google',
        providerCalendarId: 'another-calendar',
        initialSyncDirection: 'external_to_misyra',
        encryptedRefreshToken: 'another-ciphertext',
        state: 'connected',
      }),
    ).rejects.toThrow('connection_exists');
  });

  it('durably stops synchronization while retaining revocation retries until credential cleanup', async () => {
    const store = createPostgresGoogleCalendarConnectionStore(pool);
    const accountId = await createAccount();
    await prepareConsumedOAuthState(store, {
      accountId,
      stateHash: 'd'.repeat(64),
      initialSyncDirection: 'misyra_to_external',
      selectedCalendarId: null,
    });
    const connection = await store.createConnection({
      accountId,
      provider: 'google',
      providerCalendarId: 'misyra-dedicated-calendar',
      initialSyncDirection: 'misyra_to_external',
      encryptedRefreshToken: 'encrypted-revoke-token',
      state: 'connected',
    });

    const revocationRecord = {
      id: connection.id,
      encryptedRefreshToken: 'encrypted-revoke-token',
    };
    await expect(store.disconnectConnection(accountId, connection.id)).resolves.toEqual(
      revocationRecord,
    );

    const disconnected = await pool.query<{
      connectionState: string;
      encryptedRefreshToken: string | null;
    }>(
      `SELECT connection_state AS "connectionState",
              encrypted_refresh_token AS "encryptedRefreshToken"
         FROM external_calendar_connections
        WHERE id = $1`,
      [connection.id],
    );
    expect(disconnected.rows[0]).toEqual({
      connectionState: 'disconnected',
      encryptedRefreshToken: 'encrypted-revoke-token',
    });

    await expect(store.disconnectConnection(accountId, connection.id)).resolves.toEqual(
      revocationRecord,
    );
    await expect(
      store.saveOAuthState({
        accountId,
        stateHash: 'e'.repeat(64),
        expiresAt: new Date('2026-09-12T15:20:00.000Z'),
        consumedAt: null,
        initialSyncDirection: 'external_to_misyra',
        selectedCalendarId: 'replacement-calendar',
      }),
    ).rejects.toThrow('connection_exists');

    await store.clearDisconnectedRefreshToken(accountId, connection.id);

    const cleaned = await pool.query<{ encryptedRefreshToken: string | null }>(
      `SELECT encrypted_refresh_token AS "encryptedRefreshToken"
         FROM external_calendar_connections
        WHERE id = $1`,
      [connection.id],
    );
    expect(cleaned.rows[0]?.encryptedRefreshToken).toBeNull();
    await expect(store.disconnectConnection(accountId, connection.id)).resolves.toBeNull();
  });
});
