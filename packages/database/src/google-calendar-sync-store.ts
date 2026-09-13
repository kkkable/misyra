import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import { appendAccountChange } from './account-change-log.js';

type InitialSyncDirection = 'external_to_misyra' | 'misyra_to_external';
type ConnectionState =
  | 'connected'
  | 'permission_revoked'
  | 'provider_unavailable'
  | 'disconnected';
type Ownership = 'app_owned' | 'organizer_controlled';
type RecurrenceScope = 'this_occurrence' | 'this_and_future' | 'entire_series';

type CalendarRecurrence = Readonly<Record<string, unknown>>;

type TimedSchedule = Readonly<{
  type: 'timed';
  startInstant: string;
  finishInstant: string;
  timeZone: string;
  timeBehavior: 'local_time' | 'fixed_instant';
}>;

type AllDaySchedule = Readonly<{
  type: 'all_day';
  startLocalDate: string;
  endLocalDateExclusive: string;
  timeZone: string;
}>;

type ProviderSchedule = TimedSchedule | AllDaySchedule;

type SynchronizedProviderEvent = Readonly<{
  providerCalendarId: string;
  providerEventId: string;
  providerUpdatedAt: string;
  title: string | null;
  schedule: ProviderSchedule;
  recurrence: CalendarRecurrence | null;
  location: string | null;
  providerNotes: string | null;
  status: 'confirmed' | 'cancelled';
  ownership: Ownership;
}>;

type SynchronizedImportBatch = Readonly<{
  events: readonly SynchronizedProviderEvent[];
  cursor: string | null;
}>;

type SynchronizedProviderChange =
  | Readonly<{ type: 'upsert'; event: SynchronizedProviderEvent }>
  | Readonly<{
      type: 'delete';
      providerEventId: string;
      providerUpdatedAt: string;
      recurrenceScope: RecurrenceScope;
    }>;

type SynchronizedProviderChangeBatch = Readonly<{
  changes: readonly SynchronizedProviderChange[];
  cursor: string | null;
}>;

type WritableEvent = Readonly<{
  title: string;
  schedule: ProviderSchedule;
  recurrence: CalendarRecurrence | null;
  location: string | null;
  providerNotes: string | null;
}>;

type CalendarCommand =
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
      recurrenceScope: RecurrenceScope;
      patch: Partial<WritableEvent>;
    }>
  | Readonly<{
      commandId: string;
      connectionId: string;
      operation: 'delete';
      providerEventId: string;
      recurrenceScope: RecurrenceScope;
    }>;

type CalendarCommandResult =
  | Readonly<{
      commandId: string;
      status: 'applied';
      providerEventId: string;
    }>
  | Readonly<{
      commandId: string;
      status: 'failed';
      errorCode: string;
    }>;

export type GoogleCalendarSyncConnection = Readonly<{
  id: string;
  initialSyncDirection: InitialSyncDirection;
  state: ConnectionState;
}>;

export type PendingCalendarCommand = Readonly<{
  occurrenceId: string;
  command: CalendarCommand;
}>;

export type GoogleCalendarEncryptedSyncSession = Readonly<{
  providerCalendarId: string;
  encryptedRefreshToken: string;
  cursor: string | null;
  timeZone: string;
}>;

export interface PostgresGoogleCalendarSyncStore {
  getConnection(connectionId: string): Promise<GoogleCalendarSyncConnection | null>;
  reconcileFullImport(connectionId: string, batch: SynchronizedImportBatch): Promise<void>;
  applyProviderChanges(
    connectionId: string,
    batch: SynchronizedProviderChangeBatch,
  ): Promise<void>;
  listPendingCommands(connectionId: string): Promise<readonly PendingCalendarCommand[]>;
  applyCommandResults(
    connectionId: string,
    pending: readonly PendingCalendarCommand[],
    results: readonly CalendarCommandResult[],
  ): Promise<void>;
  clearCursor(connectionId: string): Promise<void>;
  loadEncryptedSession(connectionId: string): Promise<GoogleCalendarEncryptedSyncSession | null>;
}

type ConnectionContext = Readonly<{
  id: string;
  accountId: string;
  initialSyncDirection: InitialSyncDirection;
  state: ConnectionState;
  providerCalendarId: string;
}>;

type LinkedMission = Readonly<{
  occurrenceId: string;
  seriesId: string;
  completionState: string;
  synchronizationState: string;
  version: number;
  calendarSource: string;
  latestLocalEffectiveTime: Date | null;
}>;

type StoreOptions = Readonly<{
  now?: () => Date;
}>;

const IMPORTED_ALL_DAY_EFFORT_MINUTES = 30;

async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function connectionContext(
  client: Pool | PoolClient,
  connectionId: string,
): Promise<ConnectionContext | null> {
  const result = await client.query<{
    id: string;
    accountId: string;
    initialSyncDirection: InitialSyncDirection;
    state: ConnectionState;
    providerCalendarId: string | null;
  }>(
    `SELECT id,
            account_id AS "accountId",
            sync_direction AS "initialSyncDirection",
            connection_state AS state,
            provider_calendar_id AS "providerCalendarId"
       FROM external_calendar_connections
      WHERE id = $1 AND provider = 'google'`,
    [connectionId],
  );
  const row = result.rows[0];
  if (row === undefined || row.providerCalendarId === null) return null;
  return { ...row, providerCalendarId: row.providerCalendarId };
}

function requiredConnectedContext(context: ConnectionContext | null): ConnectionContext {
  if (context === null || context.state !== 'connected') {
    throw new Error('calendar_not_connected');
  }
  return context;
}

function dateParts(instant: string, timeZone: string): Readonly<{
  localDate: string;
  localDateTime: string;
}> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const localDate = `${value('year')}-${value('month')}-${value('day')}`;
  return {
    localDate,
    localDateTime: `${localDate}T${value('hour')}:${value('minute')}:${value('second')}`,
  };
}

function localMidnightInstant(localDate: string, timeZone: string): Date {
  const [yearText, monthText, dayText] = localDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error('invalid_all_day_date');
  }

  const desiredUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = desiredUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(candidate));
    const number = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? '0');
    const representedAsUtc = Date.UTC(
      number('year'),
      number('month') - 1,
      number('day'),
      number('hour'),
      number('minute'),
      number('second'),
    );
    candidate += desiredUtc - representedAsUtc;
  }
  return new Date(candidate);
}

function persistenceSchedule(schedule: ProviderSchedule): Readonly<{
  localDate: string;
  localStart: string;
  localFinish: string;
  startInstant: Date;
  finishInstant: Date;
  timeZone: string;
  timeBehavior: 'local_time' | 'fixed_instant';
  allDay: boolean;
  estimatedEffortMinutes: number | null;
}> {
  if (schedule.type === 'timed') {
    const start = dateParts(schedule.startInstant, schedule.timeZone);
    const finish = dateParts(schedule.finishInstant, schedule.timeZone);
    return {
      localDate: start.localDate,
      localStart: start.localDateTime,
      localFinish: finish.localDateTime,
      startInstant: new Date(schedule.startInstant),
      finishInstant: new Date(schedule.finishInstant),
      timeZone: schedule.timeZone,
      timeBehavior: schedule.timeBehavior,
      allDay: false,
      estimatedEffortMinutes: null,
    };
  }

  return {
    localDate: schedule.startLocalDate,
    localStart: `${schedule.startLocalDate}T00:00:00`,
    localFinish: `${schedule.endLocalDateExclusive}T00:00:00`,
    startInstant: localMidnightInstant(schedule.startLocalDate, schedule.timeZone),
    finishInstant: localMidnightInstant(schedule.endLocalDateExclusive, schedule.timeZone),
    timeZone: schedule.timeZone,
    timeBehavior: 'local_time',
    allDay: true,
    estimatedEffortMinutes: IMPORTED_ALL_DAY_EFFORT_MINUTES,
  };
}

function recurrenceJson(recurrence: CalendarRecurrence | null): string | null {
  return recurrence === null ? null : JSON.stringify(recurrence);
}

async function linkedMission(
  client: PoolClient,
  connectionId: string,
  providerEventId: string,
): Promise<LinkedMission | null> {
  const result = await client.query<{
    occurrenceId: string;
    seriesId: string;
    completionState: string;
    synchronizationState: string;
    version: number;
    calendarSource: string;
    latestLocalEffectiveTime: Date | null;
  }>(
    `SELECT mo.id AS "occurrenceId",
            mo.series_id AS "seriesId",
            mo.completion_state AS "completionState",
            mo.synchronization_state AS "synchronizationState",
            mo.version,
            mo.calendar_source AS "calendarSource",
            (
              SELECT max(dsm.effective_time)
                FROM device_sync_mutations dsm
               WHERE dsm.account_id = mo.account_id
                 AND dsm.entity_id = mo.id
                 AND dsm.validation_result = 'accepted'
            ) AS "latestLocalEffectiveTime"
       FROM external_event_links eel
       JOIN mission_occurrences mo ON mo.id = eel.occurrence_id
      WHERE eel.connection_id = $1
        AND eel.provider_event_id = $2
      ORDER BY eel.id
      LIMIT 1
      FOR UPDATE OF mo`,
    [connectionId, providerEventId],
  );
  return result.rows[0] ?? null;
}

async function hiddenEvent(
  client: PoolClient,
  connectionId: string,
  providerEventId: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
       FROM hidden_external_events
      WHERE connection_id = $1 AND provider_event_id = $2
      LIMIT 1`,
    [connectionId, providerEventId],
  );
  return result.rowCount === 1;
}

function providerIsNewerThanLocal(event: SynchronizedProviderEvent, mission: LinkedMission): boolean {
  if (mission.synchronizationState !== 'pending' || mission.latestLocalEffectiveTime === null) {
    return true;
  }
  return new Date(event.providerUpdatedAt).getTime() > mission.latestLocalEffectiveTime.getTime();
}

async function appendMissionChange(
  client: PoolClient,
  input: Readonly<{
    accountId: string;
    occurrenceId: string;
    operation: 'upsert' | 'delete';
    payload: unknown;
  }>,
): Promise<void> {
  await appendAccountChange(client, {
    accountId: input.accountId,
    entityType: 'mission',
    entityId: input.occurrenceId,
    operation: input.operation,
    payload: input.payload,
  });
}

function missionChangePayload(
  occurrenceId: string,
  seriesId: string,
  version: number,
  event: SynchronizedProviderEvent,
): unknown {
  const schedule = persistenceSchedule(event.schedule);
  return {
    version,
    series: {
      id: seriesId,
      title: event.title ?? '',
      recurrence: event.recurrence,
    },
    occurrence: {
      id: occurrenceId,
      seriesId,
      schedule: {
        localStart: schedule.localStart,
        localFinish: schedule.localFinish,
        startInstant: schedule.startInstant.toISOString(),
        finishInstant: schedule.finishInstant.toISOString(),
        timeZone: schedule.timeZone,
        timeBehavior: schedule.timeBehavior,
        allDay: schedule.allDay,
        estimatedEffortMinutes: schedule.estimatedEffortMinutes,
      },
      scheduleState: 'scheduled',
      completionState: 'incomplete',
      evidenceState: 'not_submitted',
      rewardEligibility: 'undetermined',
      rewardIssuance: 'not_issued',
      calendarSource: 'external',
      fieldOwnership: event.ownership,
      synchronizationState: 'synced',
      storyState: 'none',
      deletionState: 'active',
    },
    location: event.location,
    notes: event.providerNotes,
  };
}

async function insertImportedEvent(
  client: PoolClient,
  context: ConnectionContext,
  event: SynchronizedProviderEvent,
): Promise<void> {
  if (await hiddenEvent(client, context.id, event.providerEventId)) return;
  const schedule = persistenceSchedule(event.schedule);
  const series = await client.query<{ id: string }>(
    `INSERT INTO mission_series (account_id, title, recurrence_rule)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id`,
    [context.accountId, event.title ?? '', recurrenceJson(event.recurrence)],
  );
  const seriesId = series.rows[0]?.id;
  if (seriesId === undefined) throw new Error('calendar_import_series_insert_failed');

  const occurrence = await client.query<{ id: string }>(
    `INSERT INTO mission_occurrences (
       account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior,
       all_day, estimated_effort_minutes, schedule_state, completion_state,
       evidence_state, reward_eligibility, reward_issuance, calendar_source,
       field_ownership, synchronization_state, story_state, deletion_state,
       location, notes
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9,
       $10, $11, 'scheduled', 'incomplete',
       'not_submitted', 'undetermined', 'not_issued', 'external',
       $12, 'synced', 'none', 'active',
       $13, $14
     )
     RETURNING id`,
    [
      context.accountId,
      seriesId,
      schedule.localDate,
      schedule.localStart,
      schedule.localFinish,
      schedule.startInstant,
      schedule.finishInstant,
      schedule.timeZone,
      schedule.timeBehavior,
      schedule.allDay,
      schedule.estimatedEffortMinutes,
      event.ownership,
      event.location,
      event.providerNotes,
    ],
  );
  const occurrenceId = occurrence.rows[0]?.id;
  if (occurrenceId === undefined) throw new Error('calendar_import_occurrence_insert_failed');

  await client.query(
    `INSERT INTO external_event_links
       (connection_id, occurrence_id, provider_event_id, recurrence_scope)
     VALUES ($1, $2, $3, 'event')`,
    [context.id, occurrenceId, event.providerEventId],
  );
  await appendMissionChange(client, {
    accountId: context.accountId,
    occurrenceId,
    operation: 'upsert',
    payload: missionChangePayload(occurrenceId, seriesId, 1, event),
  });
}

async function updateImportedEvent(
  client: PoolClient,
  context: ConnectionContext,
  mission: LinkedMission,
  event: SynchronizedProviderEvent,
): Promise<void> {
  if (mission.completionState === 'completed') return;
  if (!providerIsNewerThanLocal(event, mission)) return;

  const schedule = persistenceSchedule(event.schedule);
  await client.query(
    `UPDATE mission_series
        SET title = $3,
            recurrence_rule = $4::jsonb,
            updated_at = now()
      WHERE id = $1 AND account_id = $2`,
    [mission.seriesId, context.accountId, event.title ?? '', recurrenceJson(event.recurrence)],
  );
  const nextVersion = mission.version + 1;
  await client.query(
    `UPDATE mission_occurrences
        SET local_date = $3,
            local_start = $4,
            local_finish = $5,
            start_instant = $6,
            finish_instant = $7,
            time_zone = $8,
            time_behavior = $9,
            all_day = $10,
            estimated_effort_minutes = $11,
            schedule_state = 'scheduled',
            field_ownership = $12,
            synchronization_state = 'synced',
            location = $13,
            notes = $14,
            version = $15,
            updated_at = now()
      WHERE id = $1 AND account_id = $2`,
    [
      mission.occurrenceId,
      context.accountId,
      schedule.localDate,
      schedule.localStart,
      schedule.localFinish,
      schedule.startInstant,
      schedule.finishInstant,
      schedule.timeZone,
      schedule.timeBehavior,
      schedule.allDay,
      schedule.estimatedEffortMinutes,
      event.ownership,
      event.location,
      event.providerNotes,
      nextVersion,
    ],
  );
  await appendMissionChange(client, {
    accountId: context.accountId,
    occurrenceId: mission.occurrenceId,
    operation: 'upsert',
    payload: missionChangePayload(mission.occurrenceId, mission.seriesId, nextVersion, event),
  });
}

async function reconcileUpsert(
  client: PoolClient,
  context: ConnectionContext,
  event: SynchronizedProviderEvent,
): Promise<void> {
  if (event.providerCalendarId !== context.providerCalendarId) {
    throw new Error('calendar_provider_id_mismatch');
  }
  const mission = await linkedMission(client, context.id, event.providerEventId);
  if (mission === null) {
    await insertImportedEvent(client, context, event);
    return;
  }
  await updateImportedEvent(client, context, mission, event);
}

async function reconcileDelete(
  client: PoolClient,
  context: ConnectionContext,
  providerEventId: string,
  providerUpdatedAt: string,
): Promise<void> {
  const mission = await linkedMission(client, context.id, providerEventId);
  if (mission === null || mission.completionState === 'completed') return;
  if (
    mission.synchronizationState === 'pending' &&
    mission.latestLocalEffectiveTime !== null &&
    new Date(providerUpdatedAt).getTime() <= mission.latestLocalEffectiveTime.getTime()
  ) {
    return;
  }

  const nextVersion = mission.version + 1;
  await client.query(
    `UPDATE mission_occurrences
        SET schedule_state = 'cancelled',
            synchronization_state = 'synced',
            version = $3,
            updated_at = now()
      WHERE id = $1 AND account_id = $2`,
    [mission.occurrenceId, context.accountId, nextVersion],
  );
  await appendMissionChange(client, {
    accountId: context.accountId,
    occurrenceId: mission.occurrenceId,
    operation: 'upsert',
    payload: {
      version: nextVersion,
      scheduleState: 'cancelled',
      synchronizationState: 'synced',
    },
  });
}

async function saveCursor(
  client: PoolClient,
  connectionId: string,
  cursor: string | null,
): Promise<void> {
  if (cursor === null) {
    await client.query('DELETE FROM calendar_sync_cursors WHERE connection_id = $1', [connectionId]);
    return;
  }
  await client.query(
    `INSERT INTO calendar_sync_cursors (connection_id, cursor, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (connection_id)
     DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = now()`,
    [connectionId, cursor],
  );
}

function commandSchedule(row: Readonly<{
  allDay: boolean;
  localDate: string;
  localStart: string;
  localFinish: string;
  startInstant: Date;
  finishInstant: Date;
  timeZone: string;
  timeBehavior: 'local_time' | 'fixed_instant';
}>): ProviderSchedule {
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

export function createPostgresGoogleCalendarSyncStore(
  pool: Pool,
  options: StoreOptions = {},
): PostgresGoogleCalendarSyncStore {
  const now = options.now ?? (() => new Date());

  return Object.freeze({
    async getConnection(connectionId: string): Promise<GoogleCalendarSyncConnection | null> {
      const context = await connectionContext(pool, connectionId);
      return context === null
        ? null
        : {
            id: context.id,
            initialSyncDirection: context.initialSyncDirection,
            state: context.state,
          };
    },

    async reconcileFullImport(
      connectionId: string,
      batch: SynchronizedImportBatch,
    ): Promise<void> {
      await withTransaction(pool, async (client) => {
        const context = requiredConnectedContext(await connectionContext(client, connectionId));
        for (const event of batch.events) {
          await reconcileUpsert(client, context, event);
        }
        await saveCursor(client, connectionId, batch.cursor);
      });
    },

    async applyProviderChanges(
      connectionId: string,
      batch: SynchronizedProviderChangeBatch,
    ): Promise<void> {
      await withTransaction(pool, async (client) => {
        const context = requiredConnectedContext(await connectionContext(client, connectionId));
        for (const change of batch.changes) {
          if (change.type === 'upsert') {
            await reconcileUpsert(client, context, change.event);
          } else {
            await reconcileDelete(
              client,
              context,
              change.providerEventId,
              change.providerUpdatedAt,
            );
          }
        }
        await saveCursor(client, connectionId, batch.cursor);
      });
    },

    async listPendingCommands(connectionId: string): Promise<readonly PendingCalendarCommand[]> {
      const context = requiredConnectedContext(await connectionContext(pool, connectionId));
      const result = await pool.query<{
        occurrenceId: string;
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
        synchronizationState: string;
        providerEventId: string | null;
      }>(
        `SELECT mo.id AS "occurrenceId",
                ms.title,
                ms.recurrence_rule AS recurrence,
                mo.all_day AS "allDay",
                mo.local_date::text AS "localDate",
                mo.local_start AS "localStart",
                mo.local_finish AS "localFinish",
                mo.start_instant AS "startInstant",
                mo.finish_instant AS "finishInstant",
                mo.time_zone AS "timeZone",
                mo.time_behavior AS "timeBehavior",
                mo.location,
                mo.notes,
                mo.synchronization_state AS "synchronizationState",
                eel.provider_event_id AS "providerEventId"
           FROM mission_occurrences mo
           JOIN mission_series ms ON ms.id = mo.series_id AND ms.account_id = mo.account_id
           LEFT JOIN external_event_links eel
             ON eel.occurrence_id = mo.id AND eel.connection_id = $2
          WHERE mo.account_id = $1
            AND mo.field_ownership = 'app_owned'
            AND mo.completion_state = 'incomplete'
            AND mo.schedule_state = 'scheduled'
            AND mo.deletion_state = 'active'
            AND (
              (mo.calendar_source = 'internal' AND eel.provider_event_id IS NULL)
              OR (eel.provider_event_id IS NOT NULL AND mo.synchronization_state = 'pending')
            )
          ORDER BY mo.start_instant ASC, mo.id ASC`,
        [context.accountId, connectionId],
      );

      return result.rows.map((row) => {
        const event: WritableEvent = {
          title: row.title,
          schedule: commandSchedule(row),
          recurrence: row.recurrence,
          location: row.location,
          providerNotes: row.notes,
        };
        const commandId = randomUUID();
        const command: CalendarCommand =
          row.providerEventId === null
            ? {
                commandId,
                connectionId,
                operation: 'create',
                event,
              }
            : {
                commandId,
                connectionId,
                operation: 'update',
                providerEventId: row.providerEventId,
                recurrenceScope: 'entire_series',
                patch: event,
              };
        return { occurrenceId: row.occurrenceId, command };
      });
    },

    async applyCommandResults(
      connectionId: string,
      pending: readonly PendingCalendarCommand[],
      results: readonly CalendarCommandResult[],
    ): Promise<void> {
      const byCommandId = new Map(results.map((result) => [result.commandId, result]));
      await withTransaction(pool, async (client) => {
        const context = requiredConnectedContext(await connectionContext(client, connectionId));
        for (const item of pending) {
          const result = byCommandId.get(item.command.commandId);
          if (result === undefined) continue;
          if (result.status === 'failed') {
            await client.query(
              `UPDATE mission_occurrences
                  SET synchronization_state = 'failed', updated_at = now()
                WHERE id = $1 AND account_id = $2`,
              [item.occurrenceId, context.accountId],
            );
            continue;
          }

          if (item.command.operation === 'create') {
            await client.query(
              `INSERT INTO external_event_links
                 (connection_id, occurrence_id, provider_event_id, recurrence_scope)
               VALUES ($1, $2, $3, 'event')
               ON CONFLICT (connection_id, provider_event_id, recurrence_scope)
               DO UPDATE SET occurrence_id = EXCLUDED.occurrence_id`,
              [connectionId, item.occurrenceId, result.providerEventId],
            );
          }
          await client.query(
            `UPDATE mission_occurrences
                SET synchronization_state = 'synced', updated_at = now()
              WHERE id = $1 AND account_id = $2`,
            [item.occurrenceId, context.accountId],
          );
        }
      });
    },

    async clearCursor(connectionId: string): Promise<void> {
      await pool.query('DELETE FROM calendar_sync_cursors WHERE connection_id = $1', [connectionId]);
    },

    async loadEncryptedSession(
      connectionId: string,
    ): Promise<GoogleCalendarEncryptedSyncSession | null> {
      const result = await pool.query<{
        providerCalendarId: string | null;
        encryptedRefreshToken: string | null;
        cursor: string | null;
        timeZone: string | null;
        state: ConnectionState;
      }>(
        `SELECT ecc.provider_calendar_id AS "providerCalendarId",
                ecc.encrypted_refresh_token AS "encryptedRefreshToken",
                c.cursor,
                us.app_time_zone AS "timeZone",
                ecc.connection_state AS state
           FROM external_calendar_connections ecc
           LEFT JOIN calendar_sync_cursors c ON c.connection_id = ecc.id
           LEFT JOIN user_settings us ON us.account_id = ecc.account_id
          WHERE ecc.id = $1 AND ecc.provider = 'google'`,
        [connectionId],
      );
      const row = result.rows[0];
      if (
        row === undefined ||
        row.state !== 'connected' ||
        row.providerCalendarId === null ||
        row.encryptedRefreshToken === null
      ) {
        return null;
      }
      return {
        providerCalendarId: row.providerCalendarId,
        encryptedRefreshToken: row.encryptedRefreshToken,
        cursor: row.cursor,
        timeZone: row.timeZone ?? 'UTC',
      };
    },
  });
}
