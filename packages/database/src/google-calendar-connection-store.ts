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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

export function createPostgresGoogleCalendarConnectionStore(pool: Pool) {
  return {
    async saveOAuthState(record: GoogleCalendarOAuthStateRecord): Promise<void> {
      await pool.query(
        `INSERT INTO google_calendar_oauth_states (
           state_hash,
           account_id,
           expires_at,
           consumed_at,
           initial_sync_direction,
           selected_calendar_id
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          record.stateHash,
          record.accountId,
          record.expiresAt,
          record.consumedAt,
          record.initialSyncDirection,
          record.selectedCalendarId,
        ],
      );
    },

    async consumeOAuthState(
      stateHash: string,
      currentTime: Date,
    ): Promise<GoogleCalendarOAuthStateRecord | null> {
      const result = await pool.query<OAuthStateRow>(
        `UPDATE google_calendar_oauth_states
            SET consumed_at = $2
          WHERE state_hash = $1
            AND consumed_at IS NULL
            AND expires_at > $2
        RETURNING account_id,
                  state_hash,
                  expires_at,
                  consumed_at,
                  initial_sync_direction,
                  selected_calendar_id`,
        [stateHash, currentTime],
      );
      const row = result.rows[0];
      return row ? mapOAuthState(row) : null;
    },

    async createConnection(
      record: Omit<GoogleCalendarConnectionRecord, 'id'>,
    ): Promise<GoogleCalendarConnectionRecord> {
      try {
        const result = await pool.query<ConnectionRow>(
          `INSERT INTO external_calendar_connections (
             account_id,
             provider,
             sync_direction,
             provider_calendar_id,
             encrypted_refresh_token,
             connection_state
           )
           VALUES ($1, $2, $3, $4, $5, $6)
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
        if (!row) throw new Error('connection insert returned no row');
        return mapConnection(row);
      } catch (error) {
        if (isUniqueViolation(error)) throw new Error('connection_exists', { cause: error });
        throw error;
      }
    },

    async disconnectConnection(
      accountId: string,
      connectionId: string,
    ): Promise<Pick<GoogleCalendarConnectionRecord, 'id' | 'encryptedRefreshToken'> | null> {
      const result = await pool.query<DisconnectedConnectionRow>(
        `UPDATE external_calendar_connections
            SET connection_state = 'disconnected',
                updated_at = now()
          WHERE id = $1
            AND account_id = $2
            AND provider = 'google'
            AND connection_state = 'connected'
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
  };
}
