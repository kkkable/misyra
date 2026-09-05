import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAuthStore } from './auth-store.js';
import { createPostgresDeviceSettingsStore } from './device-settings-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts039_${randomUUID().replaceAll('-', '')}`;
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

describe('MTS-039 PostgreSQL device registration and account settings', () => {
  it(
    'keeps one stable device id for the same account installation while refreshing metadata',
    async () => {
      const authStore = createPostgresAuthStore(pool);
      const store = createPostgresDeviceSettingsStore(pool);
      const account = await authStore.findOrCreateAccount('google', `mts039-${randomUUID()}`);

      const first = await store.registerDevice({
        accountId: account.id,
        installationId: 'installation-1',
        platform: 'ios',
        appVersion: '1.0.0',
        notificationCapability: 'not_determined',
      });
      const second = await store.registerDevice({
        accountId: account.id,
        installationId: 'installation-1',
        platform: 'ios',
        appVersion: '1.1.0',
        notificationCapability: 'authorized',
      });

      expect(second).toBe(first);
      const rows = await pool.query<{
        id: string;
        appVersion: string;
        notificationCapability: string;
      }>(
        `SELECT id,
                app_version AS "appVersion",
                notification_capability AS "notificationCapability"
           FROM devices
          WHERE account_id = $1 AND installation_id = $2`,
        [account.id, 'installation-1'],
      );
      expect(rows.rows).toEqual([
        { id: first, appVersion: '1.1.0', notificationCapability: 'authorized' },
      ]);
    },
  );

  it(
    'shares Trust Mode and app language across devices without overwriting other account settings',
    async () => {
      const authStore = createPostgresAuthStore(pool);
      const store = createPostgresDeviceSettingsStore(pool);
      const account = await authStore.findOrCreateAccount('apple', `mts039-${randomUUID()}`);

      await pool.query(
        `INSERT INTO user_settings (account_id, language, trust_mode, app_time_zone)
         VALUES ($1, 'en', false, 'Asia/Tokyo')`,
        [account.id],
      );

      await expect(
        store.updateAccountSettings(account.id, { language: 'zh-HK' }),
      ).resolves.toEqual({ language: 'zh-HK', trustMode: false });
      await expect(
        store.updateAccountSettings(account.id, { trustMode: true }),
      ).resolves.toEqual({ language: 'zh-HK', trustMode: true });
      await expect(store.getAccountSettings(account.id)).resolves.toEqual({
        language: 'zh-HK',
        trustMode: true,
      });

      const persisted = await pool.query<{ appTimeZone: string }>(
        `SELECT app_time_zone AS "appTimeZone" FROM user_settings WHERE account_id = $1`,
        [account.id],
      );
      expect(persisted.rows[0]?.appTimeZone).toBe('Asia/Tokyo');
    },
  );
});
