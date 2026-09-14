import type { Pool, PoolClient } from 'pg';

import { appendAccountChange } from './account-change-log.js';

type Ownership = 'app_owned' | 'organizer_controlled';
export type HiddenExternalEventRecurrenceScope =
  'this_occurrence' | 'this_and_future' | 'entire_series';

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

export type HiddenExternalEventProviderDetails = Readonly<{
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

export type HiddenExternalEventRecord = Readonly<{
  id: string;
  accountId: string;
  connectionId: string;
  provider: string | null;
  providerCalendarId: string | null;
  providerEventId: string;
  recurrenceScope: HiddenExternalEventRecurrenceScope;
  effectiveStart: Date | null;
  effectiveEnd: Date | null;
  hiddenAt: Date;
}>;

export type RestoreHiddenExternalEventInput = Readonly<{
  recurrenceScope: HiddenExternalEventRecurrenceScope;
  event: HiddenExternalEventProviderDetails;
}>;

export interface PostgresGoogleCalendarHiddenEventStore {
  listHiddenEvents(accountId: string): Promise<readonly HiddenExternalEventRecord[]>;
  getHiddenEvent(
    accountId: string,
    hiddenEventId: string,
  ): Promise<HiddenExternalEventRecord | null>;
  restoreHiddenEvent(
    connectionId: string,
    input: RestoreHiddenExternalEventInput,
  ): Promise<Readonly<{ occurrenceId: string }>>;
  restoreHiddenEventById(
    accountId: string,
    hiddenEventId: string,
    input: RestoreHiddenExternalEventInput,
  ): Promise<Readonly<{ occurrenceId: string }>>;
}

type ConnectionContext = Readonly<{
  id: string;
  accountId: string;
  providerCalendarId: string;
}>;

const IMPORTED_ALL_DAY_EFFORT_MINUTES = 30;

async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
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

async function connectedGoogleContext(
  client: PoolClient,
  connectionId: string,
): Promise<ConnectionContext> {
  const result = await client.query<{
    id: string;
    accountId: string;
    providerCalendarId: string | null;
  }>(
    `SELECT id,
            account_id AS "accountId",
            provider_calendar_id AS "providerCalendarId"
       FROM external_calendar_connections
      WHERE id = $1
        AND provider = 'google'
        AND connection_state = 'connected'
      FOR UPDATE`,
    [connectionId],
  );
  const row = result.rows[0];
  if (row === undefined || row.providerCalendarId === null) {
    throw new Error('calendar_not_connected');
  }
  return { ...row, providerCalendarId: row.providerCalendarId };
}

function dateParts(
  instant: string,
  timeZone: string,
): Readonly<{ localDate: string; localDateTime: string }> {
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

function missionChangePayload(
  occurrenceId: string,
  seriesId: string,
  event: HiddenExternalEventProviderDetails,
): unknown {
  const schedule = persistenceSchedule(event.schedule);
  return {
    version: 1,
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

async function insertFreshMission(
  client: PoolClient,
  context: ConnectionContext,
  input: RestoreHiddenExternalEventInput,
): Promise<string> {
  const { event } = input;
  const schedule = persistenceSchedule(event.schedule);
  const series = await client.query<{ id: string }>(
    `INSERT INTO mission_series (account_id, title, recurrence_rule)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id`,
    [context.accountId, event.title ?? '', recurrenceJson(event.recurrence)],
  );
  const seriesId = series.rows[0]?.id;
  if (seriesId === undefined) throw new Error('calendar_restore_series_insert_failed');

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
  if (occurrenceId === undefined) throw new Error('calendar_restore_occurrence_insert_failed');

  await client.query(
    `INSERT INTO external_event_links
       (connection_id, occurrence_id, provider_event_id, recurrence_scope)
     VALUES ($1, $2, $3, $4)`,
    [context.id, occurrenceId, event.providerEventId, input.recurrenceScope],
  );
  await appendAccountChange(client, {
    accountId: context.accountId,
    entityType: 'mission',
    entityId: occurrenceId,
    operation: 'upsert',
    payload: missionChangePayload(occurrenceId, seriesId, event),
  });
  return occurrenceId;
}

function normalizeScope(value: string): HiddenExternalEventRecurrenceScope {
  if (value === 'event') return 'this_occurrence';
  if (value === 'this_occurrence' || value === 'this_and_future' || value === 'entire_series') {
    return value;
  }
  throw new Error('calendar_hidden_event_scope_invalid');
}

function recordFromRow(row: {
  id: string;
  accountId: string;
  connectionId: string;
  provider: string | null;
  providerCalendarId: string | null;
  providerEventId: string;
  recurrenceScope: string;
  effectiveStart: Date | null;
  effectiveEnd: Date | null;
  hiddenAt: Date;
}): HiddenExternalEventRecord {
  return {
    ...row,
    recurrenceScope: normalizeScope(row.recurrenceScope),
  };
}

async function hiddenEventById(
  client: Pool | PoolClient,
  accountId: string,
  hiddenEventId: string,
  lock = false,
): Promise<HiddenExternalEventRecord | null> {
  const result = await client.query<{
    id: string;
    accountId: string;
    connectionId: string;
    provider: string | null;
    providerCalendarId: string | null;
    providerEventId: string;
    recurrenceScope: string;
    effectiveStart: Date | null;
    effectiveEnd: Date | null;
    hiddenAt: Date;
  }>(
    `SELECT id,
            account_id AS "accountId",
            connection_id AS "connectionId",
            provider,
            provider_calendar_id AS "providerCalendarId",
            provider_event_id AS "providerEventId",
            recurrence_scope AS "recurrenceScope",
            effective_start AS "effectiveStart",
            effective_end AS "effectiveEnd",
            hidden_at AS "hiddenAt"
       FROM hidden_external_events
      WHERE id = $1 AND account_id = $2
      ${lock ? 'FOR UPDATE' : ''}`,
    [hiddenEventId, accountId],
  );
  const row = result.rows[0];
  return row === undefined ? null : recordFromRow(row);
}

async function insertRemainderDismissal(
  client: PoolClient,
  source: HiddenExternalEventRecord,
  recurrenceScope: 'this_occurrence' | 'this_and_future',
  effectiveStart: Date | null,
  effectiveEnd: Date | null,
): Promise<void> {
  await client.query(
    `INSERT INTO hidden_external_events (
       account_id, connection_id, provider, provider_calendar_id,
       provider_event_id, recurrence_scope, effective_start, effective_end, hidden_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (connection_id, provider_event_id, recurrence_scope)
     DO UPDATE SET provider = EXCLUDED.provider,
                   provider_calendar_id = EXCLUDED.provider_calendar_id,
                   effective_start = EXCLUDED.effective_start,
                   effective_end = EXCLUDED.effective_end,
                   hidden_at = EXCLUDED.hidden_at`,
    [
      source.accountId,
      source.connectionId,
      source.provider,
      source.providerCalendarId,
      source.providerEventId,
      recurrenceScope,
      effectiveStart,
      effectiveEnd,
      source.hiddenAt,
    ],
  );
}

async function consumeDismissalForRestore(
  client: PoolClient,
  dismissal: HiddenExternalEventRecord,
  requestedScope: HiddenExternalEventRecurrenceScope,
  event: HiddenExternalEventProviderDetails,
): Promise<void> {
  const schedule = persistenceSchedule(event.schedule);
  if (requestedScope === 'entire_series') {
    await client.query(
      `DELETE FROM hidden_external_events
        WHERE account_id = $1
          AND connection_id = $2
          AND provider_event_id = $3`,
      [dismissal.accountId, dismissal.connectionId, dismissal.providerEventId],
    );
    return;
  }

  await client.query('DELETE FROM hidden_external_events WHERE id = $1', [dismissal.id]);

  if (requestedScope === 'this_and_future') {
    if (dismissal.recurrenceScope === 'entire_series') {
      await insertRemainderDismissal(
        client,
        dismissal,
        'this_occurrence',
        null,
        schedule.startInstant,
      );
    }
    return;
  }

  if (dismissal.recurrenceScope === 'entire_series') {
    await insertRemainderDismissal(
      client,
      dismissal,
      'this_occurrence',
      null,
      schedule.startInstant,
    );
    await insertRemainderDismissal(
      client,
      dismissal,
      'this_and_future',
      schedule.finishInstant,
      null,
    );
    return;
  }

  if (dismissal.recurrenceScope === 'this_and_future') {
    await insertRemainderDismissal(
      client,
      dismissal,
      'this_and_future',
      schedule.finishInstant,
      null,
    );
  }
}

async function restoreSelectedHiddenEvent(
  client: PoolClient,
  dismissal: HiddenExternalEventRecord,
  input: RestoreHiddenExternalEventInput,
): Promise<Readonly<{ occurrenceId: string }>> {
  const context = await connectedGoogleContext(client, dismissal.connectionId);
  if (context.accountId !== dismissal.accountId) {
    throw new Error('calendar_hidden_event_not_found');
  }
  if (
    input.event.providerCalendarId !== context.providerCalendarId ||
    input.event.providerEventId !== dismissal.providerEventId
  ) {
    throw new Error('calendar_provider_id_mismatch');
  }
  if (input.event.status !== 'confirmed') {
    throw new Error('calendar_hidden_event_not_restorable');
  }

  await consumeDismissalForRestore(client, dismissal, input.recurrenceScope, input.event);
  const occurrenceId = await insertFreshMission(client, context, input);
  return { occurrenceId };
}

export function createPostgresGoogleCalendarHiddenEventStore(
  pool: Pool,
): PostgresGoogleCalendarHiddenEventStore {
  return Object.freeze({
    async listHiddenEvents(accountId) {
      const result = await pool.query<{
        id: string;
        accountId: string;
        connectionId: string;
        provider: string | null;
        providerCalendarId: string | null;
        providerEventId: string;
        recurrenceScope: string;
        effectiveStart: Date | null;
        effectiveEnd: Date | null;
        hiddenAt: Date;
      }>(
        `SELECT id,
                account_id AS "accountId",
                connection_id AS "connectionId",
                provider,
                provider_calendar_id AS "providerCalendarId",
                provider_event_id AS "providerEventId",
                recurrence_scope AS "recurrenceScope",
                effective_start AS "effectiveStart",
                effective_end AS "effectiveEnd",
                hidden_at AS "hiddenAt"
           FROM hidden_external_events
          WHERE account_id = $1
          ORDER BY hidden_at DESC, id ASC`,
        [accountId],
      );
      return result.rows.map(recordFromRow);
    },

    getHiddenEvent(accountId, hiddenEventId) {
      return hiddenEventById(pool, accountId, hiddenEventId);
    },

    async restoreHiddenEvent(connectionId, input) {
      return withTransaction(pool, async (client) => {
        const context = await connectedGoogleContext(client, connectionId);
        if (input.event.providerCalendarId !== context.providerCalendarId) {
          throw new Error('calendar_provider_id_mismatch');
        }
        if (input.event.status !== 'confirmed') {
          throw new Error('calendar_hidden_event_not_restorable');
        }

        const dismissal = await client.query<{ id: string }>(
          `DELETE FROM hidden_external_events
            WHERE connection_id = $1
              AND account_id = $2
              AND provider_event_id = $3
              AND recurrence_scope = $4
          RETURNING id`,
          [connectionId, context.accountId, input.event.providerEventId, input.recurrenceScope],
        );
        if (dismissal.rowCount !== 1) {
          throw new Error('calendar_hidden_event_not_found');
        }

        const occurrenceId = await insertFreshMission(client, context, input);
        return { occurrenceId };
      });
    },

    async restoreHiddenEventById(accountId, hiddenEventId, input) {
      return withTransaction(pool, async (client) => {
        const dismissal = await hiddenEventById(client, accountId, hiddenEventId, true);
        if (dismissal === null) throw new Error('calendar_hidden_event_not_found');
        return restoreSelectedHiddenEvent(client, dismissal, input);
      });
    },
  });
}
