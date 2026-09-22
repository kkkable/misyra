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
const databaseName = `misyra_mts088_${randomUUID().replaceAll('-', '')}`;
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

describe('MTS-088 Planner preview synchronization', () => {
  it('replaces the draft item set and round-trips it without creating active missions', async () => {
    const auth = createPostgresAuthStore(pool);
    const devices = createPostgresDeviceSettingsStore(pool);
    const account = await auth.findOrCreateAccount('google', `mts088-${randomUUID()}`);
    const deviceId = await devices.registerDevice({
      accountId: account.id,
      installationId: 'mts088-device',
      platform: 'ios',
      appVersion: '1.0.0',
      notificationCapability: 'denied',
    });
    const store = createPostgresSyncStore(pool, () => new Date('2026-09-22T06:30:00.000Z'));
    const itemId = randomUUID();
    const mutationId = randomUUID();
    const items = [
      {
        id: itemId,
        title: 'Draft lunch',
        localDate: '2026-09-23',
        startLocalTime: '12:00',
        endLocalTime: '13:00',
        allDay: false,
        estimatedMinutes: 60,
        timeZone: 'Asia/Hong_Kong',
        location: 'Central',
        notes: 'Draft only',
      },
    ];

    await expect(
      store.push(account.id, [
        {
          mutationId,
          accountId: account.id,
          deviceId,
          entityType: 'planner',
          entityId: account.id,
          operation: 'update',
          baseVersion: null,
          clientOccurredAt: '2026-09-22T06:29:00.000Z',
          payload: { text: 'Plan lunch', imageAssetIds: [], items },
        },
      ]),
    ).resolves.toEqual({ acceptedMutationIds: [mutationId] });

    const plannerItems = await pool.query<{ id: string; ordinal: number; payload: unknown }>(
      `SELECT id, ordinal, payload
         FROM ai_planner_items
        WHERE draft_id = $1
        ORDER BY ordinal`,
      [account.id],
    );
    expect(plannerItems.rows).toEqual([{ id: itemId, ordinal: 0, payload: items[0] }]);

    expect(
      await pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM mission_occurrences WHERE account_id = $1',
        [account.id],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] });

    const pulled = await store.pull(account.id, { cursor: 0, limit: 25 });
    expect(pulled).toMatchObject({
      kind: 'incremental',
      changes: [
        {
          entityType: 'planner',
          payload: { text: 'Plan lunch', imageAssetIds: [], items },
        },
      ],
    });

    await expect(store.snapshot(account.id)).resolves.toMatchObject({
      entries: [
        {
          entityType: 'planner',
          payload: { text: 'Plan lunch', imageAssetIds: [], items },
        },
      ],
    });
  });
});
