import type { Pool, QueryResultRow } from 'pg';

export type AppleCalendarInitialSyncDirection = 'external_to_misyra' | 'misyra_to_external';
export type AppleCalendarConnectionState =
  'connected' | 'permission_revoked' | 'provider_unavailable' | 'disconnected';

export type AppleCalendarConnectionRecord = Readonly<{
  id: string;
  accountId: string;
  provider: 'apple';
  providerCalendarId: string;
  initialSyncDirection: AppleCalendarInitialSyncDirection;
  state: AppleCalendarConnectionState;
}>;

export type AppleCalendarConnectionStatusRecord = Omit<AppleCalendarConnectionRecord, 'accountId'>;

interface ConnectionRow extends QueryResultRow {
  id: string;
  account_id: string;
  provider: 'apple';
  provider_calendar_id: string;
  sync_direction: AppleCalendarInitialSyncDirection;
  connection_state: AppleCalendarConnectionState;
}

interface ConnectionStatusRow extends QueryResultRow {
  id: string;
  provider: 'apple';
  provider_calendar_id: string;
  sync_direction: AppleCalendarInitialSyncDirection;
  connection_state: AppleCalendarConnectionState;
}

function mapConnection(row: ConnectionRow): AppleCalendarConnectionRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    provider: row.provider,
    providerCalendarId: row.provider_calendar_id,
    initialSyncDirection: row.sync_direction,
    state: row.connection_state,
  };
}

function mapStatus(row: ConnectionStatusRow): AppleCalendarConnectionStatusRecord {
  return {
    id: row.id,
    provider: row.provider,
    providerCalendarId: row.provider_calendar_id,
    initialSyncDirection: row.sync_direction,
    state: row.connection_state,
  };
}

export function createPostgresAppleCalendarConnectionStore(pool: Pool) {
  return Object.freeze({
    async connect(input: {
      accountId: string;
      providerCalendarId: string;
      initialSyncDirection: AppleCalendarInitialSyncDirection;
    }): Promise<AppleCalendarConnectionRecord> {
      const result = await pool.query<ConnectionRow>(
        `INSERT INTO external_calendar_connections (
           account_id,
           provider,
           sync_direction,
           provider_calendar_id,
           encrypted_refresh_token,
           connection_state,
           oauth_state_hash,
           oauth_state_expires_at,
           oauth_state_consumed_at
         )
         VALUES ($1, 'apple', $2, $3, NULL, 'connected', NULL, NULL, NULL)
         ON CONFLICT (account_id) DO UPDATE
             SET provider = 'apple',
                 sync_direction = EXCLUDED.sync_direction,
                 provider_calendar_id = EXCLUDED.provider_calendar_id,
                 encrypted_refresh_token = NULL,
                 connection_state = 'connected',
                 oauth_state_hash = NULL,
                 oauth_state_expires_at = NULL,
                 oauth_state_consumed_at = NULL,
                 updated_at = now()
           WHERE external_calendar_connections.provider = 'apple'
             AND external_calendar_connections.connection_state = 'disconnected'
             AND external_calendar_connections.encrypted_refresh_token IS NULL
         RETURNING id,
                   account_id,
                   provider,
                   provider_calendar_id,
                   sync_direction,
                   connection_state`,
        [input.accountId, input.initialSyncDirection, input.providerCalendarId],
      );
      const row = result.rows[0];
      if (row !== undefined) return mapConnection(row);
      throw new Error('connection_exists');
    },

    async getConnectionStatus(
      accountId: string,
    ): Promise<AppleCalendarConnectionStatusRecord | null> {
      const result = await pool.query<ConnectionStatusRow>(
        `SELECT id,
                provider,
                provider_calendar_id,
                sync_direction,
                connection_state
           FROM external_calendar_connections
          WHERE account_id = $1
            AND provider = 'apple'
            AND provider_calendar_id IS NOT NULL
          LIMIT 1`,
        [accountId],
      );
      const row = result.rows[0];
      return row === undefined ? null : mapStatus(row);
    },

    async disconnectConnection(accountId: string, connectionId: string): Promise<boolean> {
      const result = await pool.query(
        `UPDATE external_calendar_connections
            SET connection_state = 'disconnected',
                provider_command_cutoff_at = CASE
                  WHEN connection_state <> 'disconnected' THEN now()
                  ELSE provider_command_cutoff_at
                END,
                updated_at = CASE
                  WHEN connection_state <> 'disconnected' THEN now()
                  ELSE updated_at
                END
          WHERE id = $1
            AND account_id = $2
            AND provider = 'apple'
            AND connection_state IN (
              'connected',
              'permission_revoked',
              'provider_unavailable',
              'disconnected'
            )`,
        [connectionId, accountId],
      );
      return result.rowCount === 1;
    },
  });
}
