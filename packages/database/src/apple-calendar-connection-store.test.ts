import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAppleCalendarConnectionStore } from './apple-calendar-connection-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts077_apple_connection_${randomUUID().replaceAll('-', '')}`;
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

async function accountId(label: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO accounts (provider, provider_subject)
     VALUES ('apple', $1)
     RETURNING id`,
    [`mts077-apple-connection-${label}-${randomUUID()}`],
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error('account insert returned no id');
  return id;
}

describe('MTS-077 Apple calendar connection metadata store', () => {
  it('persists only device-mediated Apple calendar metadata and exposes connection status', async () => {
    const id = await accountId('metadata');
    const store = createPostgresAppleCalendarConnectionStore(pool);

    const connected = await store.connect({
      accountId: id,
      providerCalendarId: 'eventkit-calendar-1',
      initialSyncDirection: 'external_to_misyra',
    });

    expect(connected).toMatchObject({
      accountId: id,
      provider: 'apple',
      providerCalendarId: 'eventkit-calendar-1',
      initialSyncDirection: 'external_to_misyra',
      state: 'connected',
    });
    await expect(store.getConnectionStatus(id)).resolves.toEqual({
      id: connected.id,
      provider: 'apple',
      providerCalendarId: 'eventkit-calendar-1',
      initialSyncDirection: 'external_to_misyra',
      state: 'connected',
    });

    const raw = await pool.query<{
      encryptedRefreshToken: string | null;
      oauthStateHash: string | null;
      oauthStateExpiresAt: Date | null;
      oauthStateConsumedAt: Date | null;
    }>(
      `SELECT encrypted_refresh_token AS "encryptedRefreshToken",
              oauth_state_hash AS "oauthStateHash",
              oauth_state_expires_at AS "oauthStateExpiresAt",
              oauth_state_consumed_at AS "oauthStateConsumedAt"
         FROM external_calendar_connections
        WHERE id = $1`,
      [connected.id],
    );
    expect(raw.rows[0]).toEqual({
      encryptedRefreshToken: null,
      oauthStateHash: null,
      oauthStateExpiresAt: null,
      oauthStateConsumedAt: null,
    });
  });

  it('reuses a disconnected Apple connection identifier so retained event links survive reconnect', async () => {
    const id = await accountId('reconnect');
    const store = createPostgresAppleCalendarConnectionStore(pool);
    const first = await store.connect({
      accountId: id,
      providerCalendarId: 'eventkit-calendar-old',
      initialSyncDirection: 'external_to_misyra',
    });
    await pool.query(
      `UPDATE external_calendar_connections
          SET connection_state = 'disconnected', provider_command_cutoff_at = now()
        WHERE id = $1`,
      [first.id],
    );

    const reconnected = await store.connect({
      accountId: id,
      providerCalendarId: 'eventkit-calendar-new',
      initialSyncDirection: 'misyra_to_external',
    });

    expect(reconnected.id).toBe(first.id);
    expect(reconnected).toMatchObject({
      providerCalendarId: 'eventkit-calendar-new',
      initialSyncDirection: 'misyra_to_external',
      state: 'connected',
    });
  });

  it('rejects replacing an active single calendar connection', async () => {
    const id = await accountId('single');
    const store = createPostgresAppleCalendarConnectionStore(pool);
    await store.connect({
      accountId: id,
      providerCalendarId: 'eventkit-calendar-1',
      initialSyncDirection: 'external_to_misyra',
    });

    await expect(
      store.connect({
        accountId: id,
        providerCalendarId: 'eventkit-calendar-2',
        initialSyncDirection: 'misyra_to_external',
      }),
    ).rejects.toThrow('connection_exists');
  });
});
