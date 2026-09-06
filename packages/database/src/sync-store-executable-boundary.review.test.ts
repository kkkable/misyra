import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAuthStore } from './auth-store.js';
import { createPostgresDeviceSettingsStore } from './device-settings-store.js';
import { applyMigrations } from './migrations.js';
import { SyncMutationValidationError, createPostgresSyncStore } from './sync-store.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_sync_boundary_${randomUUID().replaceAll('-', '')}`;
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

describe('MTS-031 executable synchronization projector boundary', () => {
  it('rejects mutations the executable mobile projector cannot consume before persisting them', async () => {
    const auth = createPostgresAuthStore(pool);
    const devices = createPostgresDeviceSettingsStore(pool);
    const account = await auth.findOrCreateAccount('google', `sync-boundary-${randomUUID()}`);
    const deviceId = await devices.registerDevice({
      accountId: account.id,
      installationId: 'installation-sync-boundary',
      platform: 'android',
      appVersion: '1.0.0',
      notificationCapability: 'not_determined',
    });
    const store = createPostgresSyncStore(pool);
    const baseMutation = {
      accountId: account.id,
      deviceId,
      baseVersion: null,
      clientOccurredAt: '2026-09-06T10:39:00.000Z',
    } as const;

    await expect(
      store.push(account.id, [
        {
          ...baseMutation,
          mutationId: randomUUID(),
          entityType: 'mission',
          entityId: randomUUID(),
          operation: 'update',
          payload: { title: 'offline mission' },
        },
      ]),
    ).rejects.toBeInstanceOf(SyncMutationValidationError);

    await expect(
      store.push(account.id, [
        {
          ...baseMutation,
          mutationId: randomUUID(),
          entityType: 'settings',
          entityId: randomUUID(),
          operation: 'update',
          payload: { trustMode: true },
        },
      ]),
    ).rejects.toBeInstanceOf(SyncMutationValidationError);

    await expect(
      store.push(account.id, [
        {
          ...baseMutation,
          mutationId: randomUUID(),
          entityType: 'settings',
          entityId: account.id,
          operation: 'create',
          payload: { language: 'zh-HK' },
        },
      ]),
    ).rejects.toBeInstanceOf(SyncMutationValidationError);

    const mutations = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM device_sync_mutations WHERE account_id = $1',
      [account.id],
    );
    const changes = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM account_change_log WHERE account_id = $1',
      [account.id],
    );

    expect(mutations.rows[0]?.count).toBe(0);
    expect(changes.rows[0]?.count).toBe(0);
  });
});
