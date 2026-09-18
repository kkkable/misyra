import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { appendAccountChange } from './account-change-log.js';

const CLAIM_TIMEOUT_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const APPLE_UPSERT_EVENT = 'external_calendar.event.upsert_requested';
const EXTERNAL_DELETE_EVENT = 'external_calendar.event.delete_requested';

type StoredRecurrenceScope = 'event' | 'this_occurrence' | 'this_and_future' | 'entire_series';
type ExecutableRecurrenceScope = 'this_occurrence' | 'this_and_future' | 'entire_series';
type CalendarRecurrence = Readonly<Record<string, unknown>>;

type ProviderSchedule =
  | Readonly<{
      type: 'timed';
      startInstant: string;
      finishInstant: string;
      timeZone: string;
      timeBehavior: 'local_time' | 'fixed_instant';
    }>
  | Readonly<{
      type: 'all_day';
      startLocalDate: string;
      endLocalDateExclusive: string;
      timeZone: string;
    }>;

type WritableEvent = Readonly<{
  title: string;
  schedule: ProviderSchedule;
  recurrence: CalendarRecurrence | null;
  location: string | null;
  providerNotes: string | null;
}>;

export type AppleDeviceCalendarCommand =
  | Readonly<{
      commandId: string;
      connectionId: string;
      operation: 'create';
      event: WritableEvent;
    }>
  | Readonly<{
      commandId: string;
      connectionId: string;
      operation: 'update';
      providerEventId: string;
      recurrenceScope: 'entire_series';
      patch: WritableEvent;
    }>
  | Readonly<{
      commandId: string;
      connectionId: string;
      operation: 'delete';
      providerEventId: string;
      recurrenceScope: ExecutableRecurrenceScope;
    }>;

export type AppleDeviceCalendarCommandClaim = Readonly<{
  claimToken: string;
  occurrenceId: string;
  providerCalendarId: string;
  command: AppleDeviceCalendarCommand;
}>;

export type AppleDeviceCalendarCommandSettlement =
  | Readonly<{
      commandId: string;
      claimToken: string;
      status: 'applied';
      providerEventId: string;
    }>
  | Readonly<{
      commandId: string;
      claimToken: string;
      status: 'failed';
      errorCode: string;
    }>;

type StoreOptions = Readonly<{
  now?: () => Date;
  claimTimeoutMs?: number;
  maxAttempts?: number;
}>;

interface ClaimedRow extends QueryResultRow {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  claimToken: string;
  providerCalendarId: string;
}

interface MissionCommandRow extends QueryResultRow {
  occurrenceId: string;
  seriesId: string;
  title: string;
  recurrence: CalendarRecurrence | null;
  allDay: boolean;
  localDate: string;
  localStart: string;
  localFinish: string;
  startInstant: Date;
  finishInstant: Date;
  timeZone: string;
  timeBehavior: 'local_time' | 'fixed_instant';
  location: string | null;
  notes: string | null;
  completionState: string;
  scheduleState: string;
  deletionState: string;
  fieldOwnership: string;
  calendarSource: string;
  providerEventId: string | null;
  recurrenceScope: StoredRecurrenceScope | null;
}

interface AuthoritativeMissionRow extends QueryResultRow {
  occurrenceId: string;
  seriesId: string;
  title: string;
  recurrence: CalendarRecurrence | null;
  localStart: string;
  localFinish: string;
  startInstant: Date;
  finishInstant: Date;
  timeZone: string;
  timeBehavior: 'local_time' | 'fixed_instant';
  allDay: boolean;
  estimatedEffortMinutes: number | null;
  scheduleState: string;
  completionState: string;
  evidenceState: string;
  rewardEligibility: string;
  rewardIssuance: string;
  calendarSource: string;
  fieldOwnership: string;
  synchronizationState: string;
  storyState: string;
  deletionState: string;
  location: string | null;
  notes: string | null;
  version: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredPayloadString(payload: unknown, key: string): string {
  if (!isRecord(payload) || typeof payload[key] !== 'string' || payload[key].length === 0) {
    throw new Error(`Apple calendar command payload is missing ${key}`);
  }
  return payload[key];
}

function executableRecurrenceScope(value: string): ExecutableRecurrenceScope {
  switch (value) {
    case 'event':
      return 'entire_series';
    case 'this_occurrence':
    case 'this_and_future':
    case 'entire_series':
      return value;
    default:
      throw new Error('Apple calendar command recurrence scope is invalid');
  }
}

function commandSchedule(row: MissionCommandRow): ProviderSchedule {
  if (row.allDay) {
    return {
      type: 'all_day',
      startLocalDate: row.localDate,
      endLocalDateExclusive: row.localFinish.slice(0, 10),
      timeZone: row.timeZone,
    };
  }
  return {
    type: 'timed',
    startInstant: row.startInstant.toISOString(),
    finishInstant: row.finishInstant.toISOString(),
    timeZone: row.timeZone,
    timeBehavior: row.timeBehavior,
  };
}

function writableEvent(row: MissionCommandRow): WritableEvent {
  return {
    title: row.title,
    schedule: commandSchedule(row),
    recurrence: row.recurrence,
    location: row.location,
    providerNotes: row.notes,
  };
}

async function discardCutoffOutboxRows(
  client: PoolClient,
  accountId: string,
  processedAt: Date,
): Promise<void> {
  await client.query(
    `UPDATE outbox_events event
        SET processed_at = $2,
            claimed_at = NULL,
            claim_token = NULL,
            last_failure_class = COALESCE(event.last_failure_class, 'connection_disconnected')
       FROM external_calendar_connections connection
      WHERE event.account_id = $1
        AND event.event_type IN ($3, $4)
        AND event.processed_at IS NULL
        AND event.dead_lettered_at IS NULL
        AND connection.account_id = event.account_id
        AND connection.id::text = event.payload->>'connectionId'
        AND connection.provider = 'apple'
        AND connection.provider_command_cutoff_at IS NOT NULL
        AND event.created_at <= connection.provider_command_cutoff_at`,
    [accountId, processedAt, APPLE_UPSERT_EVENT, EXTERNAL_DELETE_EVENT],
  );
}

async function claimOutboxRow(
  client: PoolClient,
  accountId: string,
  now: Date,
  claimTimeoutMs: number,
  maxAttempts: number,
): Promise<ClaimedRow | null> {
  const staleBefore = new Date(now.getTime() - claimTimeoutMs);
  await discardCutoffOutboxRows(client, accountId, now);
  await client.query(
    `UPDATE outbox_events
        SET dead_lettered_at = $2,
            claimed_at = NULL,
            claim_token = NULL,
            last_failure_class = COALESCE(last_failure_class, 'device_abandoned')
      WHERE account_id = $1
        AND event_type IN ($3, $4)
        AND processed_at IS NULL
        AND dead_lettered_at IS NULL
        AND attempt_count >= $5
        AND (claimed_at IS NULL OR claimed_at <= $6)`,
    [accountId, now, APPLE_UPSERT_EVENT, EXTERNAL_DELETE_EVENT, maxAttempts, staleBefore],
  );

  const claimToken = randomUUID();
  const result = await client.query<ClaimedRow>(
    `WITH candidate AS (
       SELECT event.id
         FROM outbox_events event
         JOIN external_calendar_connections connection
           ON connection.account_id = event.account_id
          AND connection.id::text = event.payload->>'connectionId'
        WHERE event.account_id = $1
          AND event.event_type IN ($2, $3)
          AND event.processed_at IS NULL
          AND event.dead_lettered_at IS NULL
          AND event.available_at <= $4
          AND event.attempt_count < $5
          AND (event.claimed_at IS NULL OR event.claimed_at <= $6)
          AND connection.provider = 'apple'
          AND connection.connection_state = 'connected'
          AND connection.provider_calendar_id IS NOT NULL
          AND (
            connection.provider_command_cutoff_at IS NULL
            OR event.created_at > connection.provider_command_cutoff_at
          )
          AND NOT EXISTS (
            SELECT 1
              FROM outbox_events active_claim
             WHERE active_claim.account_id = event.account_id
               AND active_claim.aggregate_id = event.aggregate_id
               AND active_claim.id <> event.id
               AND active_claim.event_type IN ($2, $3)
               AND active_claim.processed_at IS NULL
               AND active_claim.dead_lettered_at IS NULL
               AND active_claim.claimed_at > $6
          )
        ORDER BY event.created_at, event.id
        FOR UPDATE OF event SKIP LOCKED
        LIMIT 1
     )
     UPDATE outbox_events event
        SET claimed_at = $4,
            claim_token = $7,
            attempt_count = event.attempt_count + 1
       FROM candidate,
            external_calendar_connections connection
      WHERE event.id = candidate.id
        AND connection.account_id = event.account_id
        AND connection.id::text = event.payload->>'connectionId'
     RETURNING event.id,
               event.aggregate_id AS "aggregateId",
               event.event_type AS "eventType",
               event.payload,
               event.claim_token AS "claimToken",
               connection.provider_calendar_id AS "providerCalendarId"`,
    [
      accountId,
      APPLE_UPSERT_EVENT,
      EXTERNAL_DELETE_EVENT,
      now,
      maxAttempts,
      staleBefore,
      claimToken,
    ],
  );
  return result.rows[0] ?? null;
}

async function missionForCommand(
  client: PoolClient,
  accountId: string,
  occurrenceId: string,
  connectionId: string,
): Promise<MissionCommandRow | null> {
  const result = await client.query<MissionCommandRow>(
    `SELECT occurrence.id AS "occurrenceId",
            occurrence.series_id AS "seriesId",
            series.title,
            series.recurrence_rule AS recurrence,
            occurrence.all_day AS "allDay",
            occurrence.local_date::text AS "localDate",
            occurrence.local_start AS "localStart",
            occurrence.local_finish AS "localFinish",
            occurrence.start_instant AS "startInstant",
            occurrence.finish_instant AS "finishInstant",
            occurrence.time_zone AS "timeZone",
            occurrence.time_behavior AS "timeBehavior",
            occurrence.location,
            occurrence.notes,
            occurrence.completion_state AS "completionState",
            occurrence.schedule_state AS "scheduleState",
            occurrence.deletion_state AS "deletionState",
            occurrence.field_ownership AS "fieldOwnership",
            occurrence.calendar_source AS "calendarSource",
            link.provider_event_id AS "providerEventId",
            link.recurrence_scope AS "recurrenceScope"
       FROM mission_occurrences occurrence
       JOIN mission_series series
         ON series.id = occurrence.series_id
        AND series.account_id = occurrence.account_id
       LEFT JOIN external_event_links link
         ON link.occurrence_id = occurrence.id
        AND link.connection_id = $3
      WHERE occurrence.account_id = $1
        AND occurrence.id = $2
      FOR UPDATE OF occurrence`,
    [accountId, occurrenceId, connectionId],
  );
  return result.rows[0] ?? null;
}

function eligibleForProviderWrite(row: MissionCommandRow): boolean {
  return (
    row.calendarSource === 'internal' &&
    row.fieldOwnership === 'app_owned' &&
    row.scheduleState === 'scheduled' &&
    row.completionState === 'incomplete' &&
    row.deletionState === 'active'
  );
}

async function authoritativeMission(
  client: PoolClient,
  accountId: string,
  occurrenceId: string,
): Promise<AuthoritativeMissionRow | null> {
  const result = await client.query<AuthoritativeMissionRow>(
    `SELECT occurrence.id AS "occurrenceId",
            occurrence.series_id AS "seriesId",
            series.title,
            series.recurrence_rule AS recurrence,
            occurrence.local_start AS "localStart",
            occurrence.local_finish AS "localFinish",
            occurrence.start_instant AS "startInstant",
            occurrence.finish_instant AS "finishInstant",
            occurrence.time_zone AS "timeZone",
            occurrence.time_behavior AS "timeBehavior",
            occurrence.all_day AS "allDay",
            occurrence.estimated_effort_minutes AS "estimatedEffortMinutes",
            occurrence.schedule_state AS "scheduleState",
            occurrence.completion_state AS "completionState",
            occurrence.evidence_state AS "evidenceState",
            occurrence.reward_eligibility AS "rewardEligibility",
            occurrence.reward_issuance AS "rewardIssuance",
            occurrence.calendar_source AS "calendarSource",
            occurrence.field_ownership AS "fieldOwnership",
            occurrence.synchronization_state AS "synchronizationState",
            occurrence.story_state AS "storyState",
            occurrence.deletion_state AS "deletionState",
            occurrence.location,
            occurrence.notes,
            occurrence.version
       FROM mission_occurrences occurrence
       JOIN mission_series series
         ON series.id = occurrence.series_id
        AND series.account_id = occurrence.account_id
      WHERE occurrence.account_id = $1 AND occurrence.id = $2`,
    [accountId, occurrenceId],
  );
  return result.rows[0] ?? null;
}

function missionChangePayload(
  row: AuthoritativeMissionRow,
  providerLink: Readonly<{
    connectionId: string;
    providerCalendarId: string;
    providerEventId: string;
  }>,
) {
  return {
    version: row.version,
    series: {
      id: row.seriesId,
      title: row.title,
      recurrence: row.recurrence,
    },
    occurrence: {
      id: row.occurrenceId,
      seriesId: row.seriesId,
      schedule: {
        localStart: row.localStart,
        localFinish: row.localFinish,
        startInstant: row.startInstant.toISOString(),
        finishInstant: row.finishInstant.toISOString(),
        timeZone: row.timeZone,
        timeBehavior: row.timeBehavior,
        allDay: row.allDay,
        estimatedEffortMinutes: row.estimatedEffortMinutes,
      },
      scheduleState: row.scheduleState,
      completionState: row.completionState,
      evidenceState: row.evidenceState,
      rewardEligibility: row.rewardEligibility,
      rewardIssuance: row.rewardIssuance,
      calendarSource: row.calendarSource,
      fieldOwnership: row.fieldOwnership,
      synchronizationState: row.synchronizationState,
      storyState: row.storyState,
      deletionState: row.deletionState,
    },
    location: row.location,
    notes: row.notes,
    providerLink: {
      connectionId: providerLink.connectionId,
      provider: 'apple' as const,
      providerCalendarId: providerLink.providerCalendarId,
      providerEventId: providerLink.providerEventId,
      ownership: 'app_owned' as const,
    },
  };
}

export function createPostgresAppleCalendarDeviceCommandStore(
  pool: Pool,
  options: StoreOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const claimTimeoutMs = options.claimTimeoutMs ?? CLAIM_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;

  return Object.freeze({
    async claimNext(accountId: string): Promise<AppleDeviceCalendarCommandClaim | null> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (let skipped = 0; skipped < 20; skipped += 1) {
          const claimed = await claimOutboxRow(
            client,
            accountId,
            now(),
            claimTimeoutMs,
            maxAttempts,
          );
          if (claimed === null) {
            await client.query('COMMIT');
            return null;
          }
          const connectionId = requiredPayloadString(claimed.payload, 'connectionId');

          if (claimed.eventType === EXTERNAL_DELETE_EVENT) {
            const providerEventId = requiredPayloadString(claimed.payload, 'providerEventId');
            const recurrenceScope = executableRecurrenceScope(
              requiredPayloadString(claimed.payload, 'recurrenceScope'),
            );
            await client.query('COMMIT');
            return {
              claimToken: claimed.claimToken,
              occurrenceId: claimed.aggregateId,
              providerCalendarId: claimed.providerCalendarId,
              command: {
                commandId: claimed.id,
                connectionId,
                operation: 'delete',
                providerEventId,
                recurrenceScope,
              },
            };
          }

          const mission = await missionForCommand(
            client,
            accountId,
            claimed.aggregateId,
            connectionId,
          );
          if (mission === null || !eligibleForProviderWrite(mission)) {
            await client.query(
              `UPDATE outbox_events
                  SET processed_at = $2,
                      claimed_at = NULL,
                      claim_token = NULL
                WHERE id = $1`,
              [claimed.id, now()],
            );
            continue;
          }

          const event = writableEvent(mission);
          const command: AppleDeviceCalendarCommand =
            mission.providerEventId === null
              ? {
                  commandId: claimed.id,
                  connectionId,
                  operation: 'create',
                  event,
                }
              : {
                  commandId: claimed.id,
                  connectionId,
                  operation: 'update',
                  providerEventId: mission.providerEventId,
                  recurrenceScope: 'entire_series',
                  patch: event,
                };
          await client.query('COMMIT');
          return {
            claimToken: claimed.claimToken,
            occurrenceId: claimed.aggregateId,
            providerCalendarId: claimed.providerCalendarId,
            command,
          };
        }
        await client.query('COMMIT');
        return null;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async settle(
      accountId: string,
      settlement: AppleDeviceCalendarCommandSettlement,
    ): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const eventResult = await client.query<{
          aggregateId: string;
          eventType: string;
          payload: unknown;
        }>(
          `SELECT event.aggregate_id AS "aggregateId",
                  event.event_type AS "eventType",
                  event.payload
             FROM outbox_events event
             JOIN external_calendar_connections connection
               ON connection.account_id = event.account_id
              AND connection.id::text = event.payload->>'connectionId'
            WHERE event.id = $1
              AND event.account_id = $2
              AND event.claim_token = $3
              AND event.processed_at IS NULL
              AND event.dead_lettered_at IS NULL
              AND connection.provider = 'apple'
              AND (
                connection.provider_command_cutoff_at IS NULL
                OR event.created_at > connection.provider_command_cutoff_at
              )
            FOR UPDATE OF event, connection`,
          [settlement.commandId, accountId, settlement.claimToken],
        );
        const event = eventResult.rows[0];
        if (event === undefined) throw new Error('apple_calendar_command_claim_not_found');
        const connectionId = requiredPayloadString(event.payload, 'connectionId');

        if (settlement.status === 'failed') {
          const result = await client.query(
            `UPDATE outbox_events
                SET claimed_at = NULL,
                    claim_token = NULL,
                    last_failure_class = $2,
                    available_at = $3
              WHERE id = $1`,
            [settlement.commandId, settlement.errorCode, new Date(now().getTime() + 60_000)],
          );
          if (result.rowCount !== 1) throw new Error('apple_calendar_command_settlement_stale');
          await client.query('COMMIT');
          return;
        }

        if (event.eventType === APPLE_UPSERT_EVENT) {
          const connection = await client.query<{ providerCalendarId: string }>(
            `SELECT provider_calendar_id AS "providerCalendarId"
               FROM external_calendar_connections
              WHERE id = $1
                AND account_id = $2
                AND provider = 'apple'
                AND provider_calendar_id IS NOT NULL`,
            [connectionId, accountId],
          );
          const providerCalendarId = connection.rows[0]?.providerCalendarId;
          if (providerCalendarId === undefined) {
            throw new Error('apple_calendar_connection_not_found');
          }

          await client.query(
            `INSERT INTO external_event_links
              (connection_id, occurrence_id, provider_event_id, recurrence_scope)
             VALUES ($1, $2, $3, 'event')
             ON CONFLICT (connection_id, provider_event_id, recurrence_scope)
             DO UPDATE SET occurrence_id = EXCLUDED.occurrence_id`,
            [connectionId, event.aggregateId, settlement.providerEventId],
          );
          const mission = await authoritativeMission(client, accountId, event.aggregateId);
          if (mission !== null) {
            await appendAccountChange(client, {
              accountId,
              entityType: 'mission',
              entityId: event.aggregateId,
              operation: 'upsert',
              payload: missionChangePayload(mission, {
                connectionId,
                providerCalendarId,
                providerEventId: settlement.providerEventId,
              }),
            });
          }
        }

        const processed = await client.query(
          `UPDATE outbox_events
              SET processed_at = $2,
                  claimed_at = NULL,
                  claim_token = NULL
            WHERE id = $1
              AND claim_token = $3`,
          [settlement.commandId, now(), settlement.claimToken],
        );
        if (processed.rowCount !== 1) throw new Error('apple_calendar_command_settlement_stale');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  });
}
