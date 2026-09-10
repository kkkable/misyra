import type { Pool, QueryResultRow } from 'pg';

export type StoredDevicePlatform = 'ios' | 'android';
export type StoredNotificationCapability =
  'not_determined' | 'denied' | 'authorized' | 'unavailable';

export type RegisterDeviceInput = Readonly<{
  accountId: string;
  installationId: string;
  platform: StoredDevicePlatform;
  appVersion: string;
  notificationCapability: StoredNotificationCapability;
}>;

export type RegisterDeviceWithTimeZoneInput = RegisterDeviceInput &
  Readonly<{
    timeZone: string;
  }>;

export type RegisterDeviceWithTimeZoneResult = Readonly<{
  deviceId: string;
  timeZoneChanged: boolean;
}>;

export type StoredAccountSettings = Readonly<{
  language: 'en' | 'zh-HK';
  trustMode: boolean;
}>;

export type StoredAccountSettingsWithTimeZone = StoredAccountSettings &
  Readonly<{
    appTimeZone: string;
  }>;

export type StoredAccountSettingsUpdate = Readonly<{
  language?: 'en' | 'zh-HK' | undefined;
  trustMode?: boolean | undefined;
}>;

export type StoredAccountSettingsWithTimeZoneUpdate = StoredAccountSettingsUpdate &
  Readonly<{
    appTimeZone?: string | undefined;
  }>;

interface DeviceRow extends QueryResultRow {
  id: string;
}

interface DeviceTimeZoneRow extends DeviceRow {
  timeZone: string | null;
}

interface SettingsRow extends QueryResultRow {
  language: 'en' | 'zh-HK';
  trustMode: boolean;
}

interface SettingsTimeZoneRow extends SettingsRow {
  appTimeZone: string;
}

function assertIanaTimeZone(timeZone: string): void {
  const firstCharacter = timeZone.at(0);
  if (firstCharacter === '+' || firstCharacter === '-' || firstCharacter === '−') {
    throw new TypeError(`Invalid IANA time zone: ${timeZone}.`);
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
  } catch {
    throw new TypeError(`Invalid IANA time zone: ${timeZone}.`);
  }
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

    async registerDeviceWithTimeZoneState(
      input: RegisterDeviceWithTimeZoneInput,
    ): Promise<RegisterDeviceWithTimeZoneResult> {
      assertIanaTimeZone(input.timeZone);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `${input.accountId}:${input.installationId}`,
        ]);
        const previous = await client.query<DeviceTimeZoneRow>(
          `SELECT id, time_zone AS "timeZone"
             FROM devices
            WHERE account_id = $1 AND installation_id = $2
            FOR UPDATE`,
          [input.accountId, input.installationId],
        );
        const previousDevice = previous.rows[0];

        let deviceId: string;
        if (previousDevice === undefined) {
          const inserted = await client.query<DeviceRow>(
            `INSERT INTO devices
               (account_id, installation_id, platform, app_version, notification_capability, time_zone)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              input.accountId,
              input.installationId,
              input.platform,
              input.appVersion,
              input.notificationCapability,
              input.timeZone,
            ],
          );
          const row = inserted.rows[0];
          if (row === undefined) throw new Error('device registration returned no row');
          deviceId = row.id;
          await client.query(
            `INSERT INTO user_settings (account_id, app_time_zone)
             VALUES ($1, $2)
             ON CONFLICT (account_id) DO NOTHING`,
            [input.accountId, input.timeZone],
          );
        } else {
          deviceId = previousDevice.id;
          await client.query(
            `UPDATE devices
                SET platform = $3,
                    app_version = $4,
                    notification_capability = $5,
                    time_zone = $6,
                    updated_at = now()
              WHERE account_id = $1 AND installation_id = $2`,
            [
              input.accountId,
              input.installationId,
              input.platform,
              input.appVersion,
              input.notificationCapability,
              input.timeZone,
            ],
          );
        }

        const timeZoneChanged =
          previousDevice !== undefined &&
          previousDevice.timeZone !== null &&
          previousDevice.timeZone !== input.timeZone;
        if (timeZoneChanged) {
          await client.query(
            `INSERT INTO user_settings (account_id, app_time_zone)
             VALUES ($1, $2)
             ON CONFLICT (account_id)
             DO UPDATE SET app_time_zone = EXCLUDED.app_time_zone, updated_at = now()`,
            [input.accountId, input.timeZone],
          );
        }

        await client.query('COMMIT');
        return { deviceId, timeZoneChanged };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
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

    async getAccountSettingsWithTimeZone(
      accountId: string,
    ): Promise<StoredAccountSettingsWithTimeZone> {
      const result = await pool.query<SettingsTimeZoneRow>(
        `INSERT INTO user_settings (account_id)
         VALUES ($1)
         ON CONFLICT (account_id) DO UPDATE SET account_id = EXCLUDED.account_id
         RETURNING language, trust_mode AS "trustMode", app_time_zone AS "appTimeZone"`,
        [accountId],
      );
      const row = result.rows[0];
      if (!row) throw new Error('account settings lookup returned no row');
      return {
        language: row.language,
        trustMode: row.trustMode,
        appTimeZone: row.appTimeZone,
      };
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

    async updateAccountSettingsWithTimeZone(
      accountId: string,
      settings: StoredAccountSettingsWithTimeZoneUpdate,
    ): Promise<StoredAccountSettingsWithTimeZone> {
      if (settings.appTimeZone !== undefined) assertIanaTimeZone(settings.appTimeZone);
      const result = await pool.query<SettingsTimeZoneRow>(
        `INSERT INTO user_settings (account_id, language, trust_mode, app_time_zone)
         VALUES (
           $1,
           COALESCE($2::text, 'en'),
           COALESCE($3::boolean, false),
           COALESCE($4::text, 'UTC')
         )
         ON CONFLICT (account_id)
         DO UPDATE SET
           language = COALESCE($2::text, user_settings.language),
           trust_mode = COALESCE($3::boolean, user_settings.trust_mode),
           app_time_zone = COALESCE($4::text, user_settings.app_time_zone),
           updated_at = now()
         RETURNING language, trust_mode AS "trustMode", app_time_zone AS "appTimeZone"`,
        [
          accountId,
          settings.language ?? null,
          settings.trustMode ?? null,
          settings.appTimeZone ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('account settings update returned no row');
      return {
        language: row.language,
        trustMode: row.trustMode,
        appTimeZone: row.appTimeZone,
      };
    },
  };
}
