import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAuthStore } from './auth-store.js';
import { createPostgresDeviceSettingsStore } from './device-settings-store.js';
import { applyMigrations } from './migrations.js';
import { createPostgresSyncStore } from './sync-store.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts086_${randomUUID().replaceAll('-', '')}`;
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

describe('MTS-086 Planner sync persistence', () => {
  it('keeps one authoritative server draft and exposes the latest save through pull and snapshot', async () => {
    const auth = createPostgresAuthStore(pool);
    const devices = createPostgresDeviceSettingsStore(pool);
    const account = await auth.findOrCreateAccount('google', `mts086-${randomUUID()}`);
    const firstDevice = await devices.registerDevice({
      accountId: account.id,
      installationId: 'mts086-first-device',
      platform: 'ios',
      appVersion: '1.0.0',
      notificationCapability: 'denied',
    });
    const secondDevice = await devices.registerDevice({
      accountId: account.id,
      installationId: 'mts086-second-device',
      platform: 'android',
      appVersion: '1.0.0',
      notificationCapability: 'denied',
    });
    const store = createPostgresSyncStore(pool, () => new Date('2026-09-21T09:45:00.000Z'));

    const firstMutationId = randomUUID();
    await expect(
      store.push(account.id, [
        {
          mutationId: firstMutationId,
          accountId: account.id,
          deviceId: firstDevice,
          entityType: 'planner',
          entityId: account.id,
          operation: 'update',
          baseVersion: null,
          clientOccurredAt: '2026-09-21T09:44:00.000Z',
          payload: { text: 'Breakfast at 8', imageAssetIds: [] },
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [firstMutationId] });

    const secondMutationId = randomUUID();
    await expect(
      store.push(account.id, [
        {
          mutationId: secondMutationId,
          accountId: account.id,
          deviceId: secondDevice,
          entityType: 'planner',
          entityId: account.id,
          operation: 'update',
          baseVersion: null,
          clientOccurredAt: '2026-09-21T09:44:30.000Z',
          payload: { text: 'Breakfast at 8 and train at 9', imageAssetIds: [] },
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [secondMutationId] });

    const persisted = await pool.query<{
      id: string;
      inputText: string;
      imageAssetIds: string[];
    }>(
      `SELECT id, input_text AS "inputText", image_asset_ids AS "imageAssetIds"
         FROM ai_planner_drafts
        WHERE account_id = $1`,
      [account.id],
    );
    expect(persisted.rows).toEqual([
      {
        id: account.id,
        inputText: 'Breakfast at 8 and train at 9',
        imageAssetIds: [],
      },
    ]);

    const pulled = await store.pull(account.id, { cursor: 1, limit: 25 });
    expect(pulled).toMatchObject({
      kind: 'incremental',
      changes: [
        {
          entityType: 'planner',
          entityId: account.id,
          operation: 'upsert',
          payload: {
            text: 'Breakfast at 8 and train at 9',
            imageAssetIds: [],
          },
        },
      ],
    });
    await expect(store.snapshot(account.id)).resolves.toMatchObject({
      entries: [
        {
          entityType: 'planner',
          entityId: account.id,
          operation: 'upsert',
          payload: {
            text: 'Breakfast at 8 and train at 9',
            imageAssetIds: [],
          },
        },
      ],
    });
  });

  it('rejects Planner text beyond 2,000 characters and a fourth image on the server boundary', async () => {
    const auth = createPostgresAuthStore(pool);
    const devices = createPostgresDeviceSettingsStore(pool);
    const account = await auth.findOrCreateAccount('google', `mts086-limits-${randomUUID()}`);
    const deviceId = await devices.registerDevice({
      accountId: account.id,
      installationId: 'mts086-limit-device',
      platform: 'ios',
      appVersion: '1.0.0',
      notificationCapability: 'denied',
    });
    const store = createPostgresSyncStore(pool);

    const base = {
      accountId: account.id,
      deviceId,
      entityType: 'planner',
      entityId: account.id,
      operation: 'update',
      baseVersion: null,
      clientOccurredAt: '2026-09-21T09:46:00.000Z',
    } as const;

    await expect(
      store.push(account.id, [
        {
          ...base,
          mutationId: randomUUID(),
          payload: { text: 'a'.repeat(2_001), imageAssetIds: [] },
        },
      ]),
    ).rejects.toThrow(/2,000/);

    await expect(
      store.push(account.id, [
        {
          ...base,
          mutationId: randomUUID(),
          payload: {
            text: 'valid text',
            imageAssetIds: [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
          },
        },
      ]),
    ).rejects.toThrow(/three|3/i);
  });
});
