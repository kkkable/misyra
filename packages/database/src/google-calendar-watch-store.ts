import type { Pool } from 'pg';

export type GoogleCalendarWatchChannelRecord = Readonly<{
  connectionId: string;
  channelId: string;
  resourceId: string;
  tokenHash: string;
  expiresAt: Date;
}>;

export type GoogleCalendarWatchRegistrationRecord = Readonly<{
  channelId: string;
  resourceId: string;
  tokenHash: string;
  expiresAt: Date;
}>;

export type GoogleCalendarPullSignalRecord = Readonly<{
  connectionId: string;
  channelId: string;
  messageNumber: string;
  resourceState: string;
}>;

export type GoogleCalendarRenewalQueryRecord = Readonly<{
  before: Date;
  limit: number;
}>;

export type GoogleCalendarSaveChannelRecord = Readonly<{
  connectionId: string;
  channel: GoogleCalendarWatchRegistrationRecord;
}>;

export type GoogleCalendarRenewedChannelRecord = Readonly<{
  previousChannelId: string;
  replacement: GoogleCalendarWatchRegistrationRecord;
}>;

export interface PostgresGoogleCalendarWatchStore {
  getChannel(channelId: string): Promise<GoogleCalendarWatchChannelRecord | null>;
  schedulePullOnce(input: GoogleCalendarPullSignalRecord): Promise<boolean>;
  hasCurrentChannel(connectionId: string): Promise<boolean>;
  saveChannel(input: GoogleCalendarSaveChannelRecord): Promise<void>;
  claimConnectionMissingChannel(): Promise<string | null>;
  listChannelsDueForRenewal(
    input: GoogleCalendarRenewalQueryRecord,
  ): Promise<readonly GoogleCalendarWatchChannelRecord[]>;
  markRenewed(input: GoogleCalendarRenewedChannelRecord): Promise<void>;
}

type WatchChannelRow = Readonly<{
  connectionId: string;
  channelId: string;
  resourceId: string;
  tokenHash: string;
  expiresAt: Date;
}>;

function requirePositiveLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError('google_calendar_watch_limit_invalid');
  }
}

export function createPostgresGoogleCalendarWatchStore(
  pool: Pool,
): PostgresGoogleCalendarWatchStore {
  async function getChannel(channelId: string): Promise<GoogleCalendarWatchChannelRecord | null> {
    const result = await pool.query<WatchChannelRow>(
      `SELECT w.connection_id AS "connectionId",
              w.channel_id AS "channelId",
              w.resource_id AS "resourceId",
              w.token_hash AS "tokenHash",
              w.expires_at AS "expiresAt"
         FROM misyra_internal.google_calendar_watch_channels w
         JOIN external_calendar_connections c ON c.id = w.connection_id
        WHERE w.channel_id = $1
          AND c.provider = 'google'
          AND c.connection_state = 'connected'`,
      [channelId],
    );
    return result.rows[0] ?? null;
  }

  async function schedulePullOnce(input: GoogleCalendarPullSignalRecord): Promise<boolean> {
    const result = await pool.query<{ scheduled: boolean }>(
      `WITH connected AS (
         SELECT c.account_id
           FROM external_calendar_connections c
           JOIN misyra_internal.google_calendar_watch_channels w
             ON w.connection_id = c.id
            AND w.channel_id = $2
          WHERE c.id = $1
            AND c.provider = 'google'
            AND c.connection_state = 'connected'
       ),
       inserted_signal AS (
         INSERT INTO misyra_internal.google_calendar_watch_signals (
           channel_id, message_number, resource_state
         )
         SELECT $2, $3, $4
           FROM connected
         ON CONFLICT (channel_id, message_number) DO NOTHING
         RETURNING channel_id
       ),
       queued AS (
         INSERT INTO outbox_events (
           account_id, event_type, aggregate_type, aggregate_id, payload
         )
         SELECT connected.account_id,
                'google_calendar_pull_requested',
                'external_calendar_connection',
                $1,
                jsonb_build_object(
                  'connectionId', $1::text,
                  'channelId', $2::text,
                  'messageNumber', $3::text,
                  'resourceState', $4::text
                )
           FROM connected
           JOIN inserted_signal ON true
         RETURNING id
       )
       SELECT EXISTS (SELECT 1 FROM queued) AS scheduled`,
      [input.connectionId, input.channelId, input.messageNumber, input.resourceState],
    );
    return result.rows[0]?.scheduled ?? false;
  }

  async function hasCurrentChannel(connectionId: string): Promise<boolean> {
    const result = await pool.query<{ present: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM misyra_internal.google_calendar_watch_channels w
           JOIN external_calendar_connections c ON c.id = w.connection_id
          WHERE w.connection_id = $1
            AND w.superseded_at IS NULL
            AND w.expires_at > CURRENT_TIMESTAMP
            AND c.provider = 'google'
            AND c.connection_state = 'connected'
       ) AS present`,
      [connectionId],
    );
    return result.rows[0]?.present ?? false;
  }

  async function saveChannel(input: GoogleCalendarSaveChannelRecord): Promise<void> {
    await pool.query(
      `WITH inserted_channel AS (
         INSERT INTO misyra_internal.google_calendar_watch_channels (
           channel_id, connection_id, resource_id, token_hash, expires_at
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING channel_id, connection_id
       )
       INSERT INTO outbox_events (
         account_id, event_type, aggregate_type, aggregate_id, payload
       )
       SELECT c.account_id,
              'google_calendar_pull_requested',
              'external_calendar_connection',
              inserted_channel.connection_id,
              jsonb_build_object(
                'connectionId', inserted_channel.connection_id::text,
                'channelId', inserted_channel.channel_id,
                'reason', 'watch_registered'
              )
         FROM inserted_channel
         JOIN external_calendar_connections c ON c.id = inserted_channel.connection_id
        WHERE c.provider = 'google'
          AND c.connection_state = 'connected'`,
      [
        input.channel.channelId,
        input.connectionId,
        input.channel.resourceId,
        input.channel.tokenHash,
        input.channel.expiresAt,
      ],
    );
  }

  async function claimConnectionMissingChannel(): Promise<string | null> {
    const result = await pool.query<{ connectionId: string }>(
      `WITH candidate AS (
         SELECT c.id
           FROM external_calendar_connections c
           LEFT JOIN misyra_internal.google_calendar_watch_repair_claims r
             ON r.connection_id = c.id
          WHERE c.provider = 'google'
            AND c.connection_state = 'connected'
            AND NOT EXISTS (
              SELECT 1
                FROM misyra_internal.google_calendar_watch_channels w
               WHERE w.connection_id = c.id
                 AND w.superseded_at IS NULL
            )
            AND (r.claimed_until IS NULL OR r.claimed_until <= CURRENT_TIMESTAMP)
          ORDER BY c.created_at ASC, c.id ASC
          LIMIT 1
          FOR UPDATE OF c SKIP LOCKED
       ),
       claimed AS (
         INSERT INTO misyra_internal.google_calendar_watch_repair_claims (
           connection_id, claimed_until
         )
         SELECT id, CURRENT_TIMESTAMP + INTERVAL '15 minutes'
           FROM candidate
         ON CONFLICT (connection_id) DO UPDATE
           SET claimed_until = EXCLUDED.claimed_until
         RETURNING connection_id
       )
       SELECT connection_id AS "connectionId" FROM claimed`,
    );
    return result.rows[0]?.connectionId ?? null;
  }

  async function listChannelsDueForRenewal(
    input: GoogleCalendarRenewalQueryRecord,
  ): Promise<readonly GoogleCalendarWatchChannelRecord[]> {
    requirePositiveLimit(input.limit);
    const result = await pool.query<WatchChannelRow>(
      `WITH due AS (
         SELECT w.channel_id
           FROM misyra_internal.google_calendar_watch_channels w
           JOIN external_calendar_connections c ON c.id = w.connection_id
          WHERE w.superseded_at IS NULL
            AND w.expires_at <= $1
            AND (w.renewal_claimed_until IS NULL OR w.renewal_claimed_until <= CURRENT_TIMESTAMP)
            AND c.provider = 'google'
            AND c.connection_state = 'connected'
          ORDER BY w.expires_at ASC, w.channel_id ASC
          LIMIT $2
          FOR UPDATE OF w SKIP LOCKED
       )
       UPDATE misyra_internal.google_calendar_watch_channels w
          SET renewal_claimed_until = CURRENT_TIMESTAMP + INTERVAL '15 minutes'
         FROM due
        WHERE w.channel_id = due.channel_id
       RETURNING w.connection_id AS "connectionId",
                 w.channel_id AS "channelId",
                 w.resource_id AS "resourceId",
                 w.token_hash AS "tokenHash",
                 w.expires_at AS "expiresAt"`,
      [input.before, input.limit],
    );
    return result.rows;
  }

  async function markRenewed(input: GoogleCalendarRenewedChannelRecord): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const previous = await client.query<{ connectionId: string }>(
        `UPDATE misyra_internal.google_calendar_watch_channels
            SET superseded_at = CURRENT_TIMESTAMP
          WHERE channel_id = $1
            AND superseded_at IS NULL
        RETURNING connection_id AS "connectionId"`,
        [input.previousChannelId],
      );
      const connectionId = previous.rows[0]?.connectionId;
      if (connectionId === undefined) {
        throw new Error('google_calendar_watch_channel_not_current');
      }

      await client.query(
        `INSERT INTO misyra_internal.google_calendar_watch_channels (
           channel_id, connection_id, resource_id, token_hash, expires_at
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          input.replacement.channelId,
          connectionId,
          input.replacement.resourceId,
          input.replacement.tokenHash,
          input.replacement.expiresAt,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return Object.freeze({
    getChannel,
    schedulePullOnce,
    hasCurrentChannel,
    saveChannel,
    claimConnectionMissingChannel,
    listChannelsDueForRenewal,
    markRenewed,
  });
}
