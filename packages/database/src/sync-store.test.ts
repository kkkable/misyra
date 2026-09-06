import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAuthStore } from './auth-store.js';
import { createPostgresDeviceSettingsStore } from './device-settings-store.js';
import { applyMigrations } from './migrations.js';
import {
  SyncDeviceOwnershipError,
  SyncMutationConflictError,
  createPostgresSyncStore,
} from './sync-store.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_sync_runtime_${randomUUID().replaceAll('-', '')}`;
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

describe('MTS-031/MTS-039 PostgreSQL executable sync store', () => {
  it('accepts an authenticated settings mutation once and returns the authoritative full settings change', async () => {
    const auth = createPostgresAuthStore(pool);
    const devices = createPostgresDeviceSettingsStore(pool);
    const account = await auth.findOrCreateAccount('google', `sync-${randomUUID()}`);
    const deviceId = await devices.registerDevice({
      accountId: account.id,
      installationId: 'installation-a',
      platform: 'android',
      appVersion: '1.0.0',
      notificationCapability: 'denied',
    });
    const mutationId = randomUUID();
    const mutation = {
      mutationId,
      accountId: account.id,
      deviceId,
      entityType: 'settings',
      entityId: account.id,
      operation: 'update',
      baseVersion: null,
      clientOccurredAt: '2026-09-06T09:00:00.000Z',
      payload: { language: 'zh-HK', trustMode: true },
    } as const;
    const store = createPostgresSyncStore(pool, () => new Date('2026-09-06T09:00:01.000Z'));

    await expect(store.push(account.id, [mutation])).resolves.toEqual({
      acceptedMutationIds: [mutationId],
    });
    await expect(store.push(account.id, [mutation])).resolves.toEqual({
      acceptedMutationIds: [mutationId],
    });
    await expect(devices.getAccountSettings(account.id)).resolves.toEqual({
      language: 'zh-HK',
      trustMode: true,
    });

    await expect(store.pull(account.id, { cursor: 0, limit: 25 })).resolves.toEqual({
      kind: 'incremental',
      changes: [
        {
          accountId: account.id,
          sequence: 1,
          entityType: 'settings',
          entityId: account.id,
          operation: 'upsert',
          payload: { language: 'zh-HK', trustMode: true },
        },
      ],
      nextCursor: 1,
      hasMore: false,
    });
    await expect(store.snapshot(account.id)).resolves.toEqual({
      entries: [
        {
          accountId: account.id,
          sequence: 1,
          entityType: 'settings',
          entityId: account.id,
          operation: 'upsert',
          payload: { language: 'zh-HK', trustMode: true },
        },
      ],
      nextCursor: 1,
    });
  });

  it('rejects mutation-id reuse with different content and rejects a device owned by another account', async () => {
    const auth = createPostgresAuthStore(pool);
    const devices = createPostgresDeviceSettingsStore(pool);
    const first = await auth.findOrCreateAccount('google', `sync-${randomUUID()}`);
    const second = await auth.findOrCreateAccount('apple', `sync-${randomUUID()}`);
    const firstDevice = await devices.registerDevice({
      accountId: first.id,
      installationId: 'installation-first',
      platform: 'ios',
      appVersion: '1.0.0',
      notificationCapability: 'not_determined',
    });
    const secondDevice = await devices.registerDevice({
      accountId: second.id,
      installationId: 'installation-second',
      platform: 'android',
      appVersion: '1.0.0',
      notificationCapability: 'not_determined',
    });
    const mutationId = randomUUID();
    const store = createPostgresSyncStore(pool);
    const firstMutation = {
      mutationId,
      accountId: first.id,
      deviceId: firstDevice,
      entityType: 'settings',
      entityId: first.id,
      operation: 'update',
      baseVersion: null,
      clientOccurredAt: '2026-09-06T09:05:00.000Z',
      payload: { trustMode: true },
    } as const;

    await store.push(first.id, [firstMutation]);
    await expect(
      store.push(first.id, [{ ...firstMutation, payload: { trustMode: false } }]),
    ).rejects.toBeInstanceOf(SyncMutationConflictError);
    await expect(
      store.push(first.id, [
        {
          ...firstMutation,
          mutationId: randomUUID(),
          deviceId: secondDevice,
        },
      ]),
    ).rejects.toBeInstanceOf(SyncDeviceOwnershipError);
    await expect(devices.getAccountSettings(first.id)).resolves.toEqual({
      language: 'en',
      trustMode: true,
    });
  });
});
