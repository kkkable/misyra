import type { Pool, QueryResultRow } from 'pg';

export type StoredDevicePlatform = 'ios' | 'android';
export type StoredNotificationCapability =
  | 'not_determined'
  | 'denied'
  | 'authorized'
  | 'unavailable';

export type RegisterDeviceInput = Readonly<{
  accountId: string;
  installationId: string;
  platform: StoredDevicePlatform;
  appVersion: string;
  notificationCapability: StoredNotificationCapability;
}>;

export type StoredAccountSettings = Readonly<{
  language: 'en' | 'zh-HK';
  trustMode: boolean;
}>;

export type StoredAccountSettingsUpdate = Readonly<{
  language?: 'en' | 'zh-HK';
  trustMode?: boolean;
}>;

interface DeviceRow extends QueryResultRow {
  id: string;
}

interface SettingsRow extends QueryResultRow {
  language: 'en' | 'zh-HK';
  trustMode: boolean;
}

export function createPostgresDeviceSettingsStore(pool: Pool) {
  return {
    async registerDevice(input: RegisterDeviceInput): Promise<string> {
      const result = await pool.query<DeviceRow>(
        `INSERT INTO devices
           (account_id, installation_id, platform, app_version, notification_capability)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_id, installation_id)
         DO UPDATE SET
           platform = EXCLUDED.platform,
           app_version = EXCLUDED.app_version,
           notification_capability = EXCLUDED.notification_capability,
           updated_at = now()
         RETURNING id`,
        [
          input.accountId,
          input.installationId,
          input.platform,
          input.appVersion,
          input.notificationCapability,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('device registration returned no row');
      return row.id;
    },

    async getAccountSettings(accountId: string): Promise<StoredAccountSettings> {
      const result = await pool.query<SettingsRow>(
        `INSERT INTO user_settings (account_id)
         VALUES ($1)
         ON CONFLICT (account_id) DO UPDATE SET account_id = EXCLUDED.account_id
         RETURNING language, trust_mode AS "trustMode"`,
        [accountId],
      );
      const row = result.rows[0];
      if (!row) throw new Error('account settings lookup returned no row');
      return { language: row.language, trustMode: row.trustMode };
    },

    async updateAccountSettings(
      accountId: string,
      settings: StoredAccountSettingsUpdate,
    ): Promise<StoredAccountSettings> {
      const result = await pool.query<SettingsRow>(
        `INSERT INTO user_settings (account_id, language, trust_mode)
         VALUES ($1, COALESCE($2::text, 'en'), COALESCE($3::boolean, false))
         ON CONFLICT (account_id)
         DO UPDATE SET
           language = COALESCE($2::text, user_settings.language),
           trust_mode = COALESCE($3::boolean, user_settings.trust_mode),
           updated_at = now()
         RETURNING language, trust_mode AS "trustMode"`,
        [accountId, settings.language ?? null, settings.trustMode ?? null],
      );
      const row = result.rows[0];
      if (!row) throw new Error('account settings update returned no row');
      return { language: row.language, trustMode: row.trustMode };
    },
  };
}
