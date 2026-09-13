import type { Pool } from 'pg';

export type GoogleCalendarInitialSyncDirection = 'external_to_misyra' | 'misyra_to_external';

export type GoogleCalendarOAuthStateRecord = Readonly<{
  accountId: string;
  stateHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  initialSyncDirection: GoogleCalendarInitialSyncDirection;
  selectedCalendarId: string | null;
}>;

export type GoogleCalendarConnectionRecord = Readonly<{
  id: string;
  accountId: string;
  provider: 'google';
  providerCalendarId: string;
  initialSyncDirection: GoogleCalendarInitialSyncDirection;
  encryptedRefreshToken: string;
  state: 'connected' | 'disconnected';
}>;

type OAuthStateRow = Readonly<{
  account_id: string;
  state_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  initial_sync_direction: GoogleCalendarInitialSyncDirection;
  selected_calendar_id: string | null;
}>;

type ConnectionRow = Readonly<{
  id: string;
  account_id: string;
  provider: 'google';
  provider_calendar_id: string;
  sync_direction: GoogleCalendarInitialSyncDirection;
  encrypted_refresh_token: string;
  connection_state: 'connected' | 'disconnected';
}>;

type DisconnectedConnectionRow = Readonly<{
  id: string;
  encrypted_refresh_token: string;
}>;

function mapOAuthState(row: OAuthStateRow): GoogleCalendarOAuthStateRecord {
  return {
    accountId: row.account_id,
    stateHash: row.state_hash,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    initialSyncDirection: row.initial_sync_direction,
    selectedCalendarId: row.selected_calendar_id,
  };
}

function mapConnection(row: ConnectionRow): GoogleCalendarConnectionRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    provider: row.provider,
    providerCalendarId: row.provider_calendar_id,
    initialSyncDirection: row.sync_direction,
    encryptedRefreshToken: row.encrypted_refresh_token,
    state: row.connection_state,
  };
}

export function createPostgresGoogleCalendarConnectionStore(pool: Pool) {
  return {
    async saveOAuthState(record: GoogleCalendarOAuthStateRecord): Promise<void> {
      const result = await pool.query<{ id: string }>(
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
         VALUES ($1, 'google', $2, $3, NULL, 'disconnected', $4, $5, $6)
         ON CONFLICT (account_id) DO UPDATE
             SET provider = 'google',
                 sync_direction = EXCLUDED.sync_direction,
                 provider_calendar_id = EXCLUDED.provider_calendar_id,
                 encrypted_refresh_token = NULL,
                 connection_state = 'disconnected',
                 oauth_state_hash = EXCLUDED.oauth_state_hash,
                 oauth_state_expires_at = EXCLUDED.oauth_state_expires_at,
                 oauth_state_consumed_at = EXCLUDED.oauth_state_consumed_at,
                 updated_at = now()
           WHERE external_calendar_connections.connection_state = 'disconnected'
         RETURNING id`,
        [
          record.accountId,
          record.initialSyncDirection,
          record.selectedCalendarId,
          record.stateHash,
          record.expiresAt,
          record.consumedAt,
        ],
      );

      if (!result.rows[0]) throw new Error('connection_exists');
    },

    async consumeOAuthState(
      stateHash: string,
      currentTime: Date,
    ): Promise<GoogleCalendarOAuthStateRecord | null> {
      const result = await pool.query<OAuthStateRow>(
        `WITH candidate AS (
           SELECT id
             FROM external_calendar_connections
            WHERE provider = 'google'
              AND connection_state = 'disconnected'
              AND oauth_state_hash = $1
              AND oauth_state_consumed_at IS NULL
              AND oauth_state_expires_at > $2
            ORDER BY id
            LIMIT 1
            FOR UPDATE
         )
         UPDATE external_calendar_connections AS connection
            SET oauth_state_consumed_at = $2,
                updated_at = now()
           FROM candidate
          WHERE connection.id = candidate.id
         RETURNING connection.account_id,
                   connection.oauth_state_hash AS state_hash,
                   connection.oauth_state_expires_at AS expires_at,
                   connection.oauth_state_consumed_at AS consumed_at,
                   connection.sync_direction AS initial_sync_direction,
                   connection.provider_calendar_id AS selected_calendar_id`,
        [stateHash, currentTime],
      );
      const row = result.rows[0];
      return row ? mapOAuthState(row) : null;
    },

    async createConnection(
      record: Omit<GoogleCalendarConnectionRecord, 'id'>,
    ): Promise<GoogleCalendarConnectionRecord> {
      const result = await pool.query<ConnectionRow>(
        `UPDATE external_calendar_connections
            SET provider = $2,
                sync_direction = $3,
                provider_calendar_id = $4,
                encrypted_refresh_token = $5,
                connection_state = $6,
                oauth_state_hash = NULL,
                oauth_state_expires_at = NULL,
                oauth_state_consumed_at = NULL,
                updated_at = now()
          WHERE account_id = $1
            AND provider = 'google'
            AND connection_state = 'disconnected'
            AND oauth_state_consumed_at IS NOT NULL
        RETURNING id,
                  account_id,
                  provider,
                  provider_calendar_id,
                  sync_direction,
                  encrypted_refresh_token,
                  connection_state`,
        [
          record.accountId,
          record.provider,
          record.initialSyncDirection,
          record.providerCalendarId,
          record.encryptedRefreshToken,
          record.state,
        ],
      );
      const row = result.rows[0];
      if (row) return mapConnection(row);

      const existing = await pool.query<{ connection_state: string }>(
        `SELECT connection_state
           FROM external_calendar_connections
          WHERE account_id = $1`,
        [record.accountId],
      );
      if (existing.rows[0]?.connection_state === 'connected') {
        throw new Error('connection_exists');
      }
      throw new Error('connection_state_missing');
    },

    async disconnectConnection(
      accountId: string,
      connectionId: string,
    ): Promise<Pick<GoogleCalendarConnectionRecord, 'id' | 'encryptedRefreshToken'> | null> {
      const result = await pool.query<DisconnectedConnectionRow>(
        `UPDATE external_calendar_connections
            SET connection_state = 'disconnected',
                updated_at = CASE
                  WHEN connection_state = 'connected' THEN now()
                  ELSE updated_at
                END
          WHERE id = $1
            AND account_id = $2
            AND provider = 'google'
            AND connection_state IN ('connected', 'disconnected')
            AND encrypted_refresh_token IS NOT NULL
        RETURNING id,
                  encrypted_refresh_token`,
        [connectionId, accountId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        encryptedRefreshToken: row.encrypted_refresh_token,
      };
    },

    async clearDisconnectedRefreshToken(accountId: string, connectionId: string): Promise<void> {
      await pool.query(
        `UPDATE external_calendar_connections
            SET encrypted_refresh_token = NULL,
                updated_at = now()
          WHERE id = $1
            AND account_id = $2
            AND provider = 'google'
            AND connection_state = 'disconnected'`,
        [connectionId, accountId],
      );
    },
  };
}
