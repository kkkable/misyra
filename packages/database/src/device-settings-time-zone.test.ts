import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresAuthStore } from './auth-store.js';
import { createPostgresDeviceSettingsStore } from './device-settings-store.js';
import { applyMigrations } from './migrations.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts053_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;
let pool: Pool;

type TimeZoneRegistrationInput = Readonly<{
  accountId: string;
  installationId: string;
  platform: 'ios' | 'android';
  appVersion: string;
  notificationCapability: 'not_determined' | 'denied' | 'authorized' | 'unavailable';
  timeZone: string;
}>;

type TimeZoneRegistrationResult = Readonly<{
  deviceId: string;
  timeZoneChanged: boolean;
}>;

type TimeZoneSettings = Readonly<{
  language: 'en' | 'zh-HK';
  trustMode: boolean;
  appTimeZone: string;
}>;

type TimeZoneSettingsUpdate = Readonly<{
  language?: 'en' | 'zh-HK' | undefined;
  trustMode?: boolean | undefined;
  appTimeZone?: string | undefined;
}>;

type TimeZoneAwareStore = Readonly<{
  registerDeviceWithTimeZoneState(
    input: TimeZoneRegistrationInput,
  ): Promise<TimeZoneRegistrationResult>;
  getAccountSettingsWithTimeZone(accountId: string): Promise<TimeZoneSettings>;
  updateAccountSettingsWithTimeZone(
    accountId: string,
    settings: TimeZoneSettingsUpdate,
  ): Promise<TimeZoneSettings>;
}>;

function createTimeZoneAwareStore(): TimeZoneAwareStore {
  return createPostgresDeviceSettingsStore(pool) as unknown as TimeZoneAwareStore;
}

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

describe('MTS-053 device-zone and account-zone ownership', () => {
  it('initializes the account zone from the first device, preserves a manual override on ordinary registration, and replaces it only after an actual device-zone change', async () => {
    const authStore = createPostgresAuthStore(pool);
    const store = createTimeZoneAwareStore();
    const account = await authStore.findOrCreateAccount('google', `mts053-${randomUUID()}`);

    const first = await store.registerDeviceWithTimeZoneState({
      accountId: account.id,
      installationId: 'installation-zone-1',
      platform: 'ios',
      appVersion: '1.0.0',
      notificationCapability: 'authorized',
      timeZone: 'Asia/Tokyo',
    });
    expect(first.timeZoneChanged).toBe(false);
    await expect(store.getAccountSettingsWithTimeZone(account.id)).resolves.toEqual({
      language: 'en',
      trustMode: false,
      appTimeZone: 'Asia/Tokyo',
    });

    await expect(
      store.updateAccountSettingsWithTimeZone(account.id, { appTimeZone: 'America/New_York' }),
    ).resolves.toEqual({
      language: 'en',
      trustMode: false,
      appTimeZone: 'America/New_York',
    });

    const unchanged = await store.registerDeviceWithTimeZoneState({
      accountId: account.id,
      installationId: 'installation-zone-1',
      platform: 'ios',
      appVersion: '1.0.1',
      notificationCapability: 'authorized',
      timeZone: 'Asia/Tokyo',
    });
    expect(unchanged).toEqual({ deviceId: first.deviceId, timeZoneChanged: false });
    await expect(store.getAccountSettingsWithTimeZone(account.id)).resolves.toEqual({
      language: 'en',
      trustMode: false,
      appTimeZone: 'America/New_York',
    });

    await pool.query(
      `INSERT INTO streak_days (account_id, local_date, state, finalized, updated_at)
       VALUES ($1, '2026-09-09', 'continued', true, '2026-09-09T23:59:00.000Z')`,
      [account.id],
    );
    const streakBefore = await pool.query<{
      localDate: string;
      state: string;
      finalized: boolean;
      updatedAt: Date;
    }>(
      `SELECT local_date::text AS "localDate", state, finalized, updated_at AS "updatedAt"
         FROM streak_days
        WHERE account_id = $1`,
      [account.id],
    );

    const changed = await store.registerDeviceWithTimeZoneState({
      accountId: account.id,
      installationId: 'installation-zone-1',
      platform: 'ios',
      appVersion: '1.0.2',
      notificationCapability: 'authorized',
      timeZone: 'Europe/London',
    });
    expect(changed).toEqual({ deviceId: first.deviceId, timeZoneChanged: true });
    await expect(store.getAccountSettingsWithTimeZone(account.id)).resolves.toEqual({
      language: 'en',
      trustMode: false,
      appTimeZone: 'Europe/London',
    });

    const streakAfter = await pool.query<{
      localDate: string;
      state: string;
      finalized: boolean;
      updatedAt: Date;
    }>(
      `SELECT local_date::text AS "localDate", state, finalized, updated_at AS "updatedAt"
         FROM streak_days
        WHERE account_id = $1`,
      [account.id],
    );
    expect(streakAfter.rows).toEqual(streakBefore.rows);
  });

  it('treats a newly observed zone on a pre-MTS-053 device as initialization rather than a false change notice', async () => {
    const authStore = createPostgresAuthStore(pool);
    const store = createTimeZoneAwareStore();
    const account = await authStore.findOrCreateAccount('apple', `mts053-${randomUUID()}`);

    await pool.query(
      `INSERT INTO user_settings (account_id, language, trust_mode, app_time_zone)
       VALUES ($1, 'zh-HK', true, 'Asia/Hong_Kong')`,
      [account.id],
    );
    await pool.query(
      `INSERT INTO devices
         (account_id, installation_id, platform, app_version, notification_capability)
       VALUES ($1, 'legacy-installation', 'android', '0.9.0', 'denied')`,
      [account.id],
    );

    const registration = await store.registerDeviceWithTimeZoneState({
      accountId: account.id,
      installationId: 'legacy-installation',
      platform: 'android',
      appVersion: '1.0.0',
      notificationCapability: 'denied',
      timeZone: 'Asia/Tokyo',
    });

    expect(registration.timeZoneChanged).toBe(false);
    await expect(store.getAccountSettingsWithTimeZone(account.id)).resolves.toEqual({
      language: 'zh-HK',
      trustMode: true,
      appTimeZone: 'Asia/Hong_Kong',
    });
  });
});
