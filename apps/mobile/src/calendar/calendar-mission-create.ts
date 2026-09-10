import {
  createMissionOccurrence,
  createMissionSeries,
  createZonedAllDaySchedule,
  createZonedTimedSchedule,
  evaluateSchedulePlacement,
  expandRecurrenceDates,
  type MissionOccurrence,
  type MissionRecurrence,
  type MissionSeries,
  type RewardEligibility,
  type TimeBehavior,
} from '@misyra/domain';

import { createMutationQueue, type MutationQueueDatabase } from '../storage/mutation-queue.js';

export type CalendarMissionCreateInput = Readonly<{
  selectedDate: string;
  title: string;
  allDay?: boolean;
  startMinute: number | null;
  endMinute: number | null;
  estimatedEffortMinutes?: number | null;
  rewardEligibility: RewardEligibility;
  timeZone: string;
  timeBehavior?: TimeBehavior;
  recurrence?: MissionRecurrence | null;
  private?: boolean;
  location?: string | null;
  notes?: string | null;
}>;

type CalendarMissionCreateOptions = Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  input: CalendarMissionCreateInput;
  now: Date;
  generateId: () => string;
}>;

type CalendarMission = Readonly<{
  series: MissionSeries;
  occurrence: MissionOccurrence;
}>;

const MINUTES_PER_DAY = 24 * 60;
const MAX_TIMED_END_MINUTE = MINUTES_PER_DAY * 2;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RECURRENCE_MATERIALIZATION_DAYS = 730;

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new TypeError(`${label} must not be empty.`);
}
function assertStartMinute(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MINUTES_PER_DAY) {
    throw new RangeError(
      `Mission start minute must be an integer from 0 to ${String(MINUTES_PER_DAY)}.`,
    );
  }
}
function assertEndMinute(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_TIMED_END_MINUTE) {
    throw new RangeError(
      `Mission end minute must be an integer from 0 to ${String(MAX_TIMED_END_MINUTE)}.`,
    );
  }
}
function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0)
    throw new RangeError(`${label} must be a positive integer.`);
}
function localDateTime(localDate: string, minute: number): string {
  if (!LOCAL_DATE_PATTERN.test(localDate))
    throw new TypeError('Mission date must use YYYY-MM-DD format.');
  if (!Number.isInteger(minute) || minute < 0 || minute > MAX_TIMED_END_MINUTE) {
    throw new RangeError('Mission local date-time minute is outside the supported range.');
  }
  const dayOffset = Math.floor(minute / MINUTES_PER_DAY);
  const minuteWithinDay = minute % MINUTES_PER_DAY;
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  const hour = Math.floor(minuteWithinDay / 60);
  const minuteWithinHour = minuteWithinDay % 60;
  return `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:${String(minuteWithinHour).padStart(2, '0')}:00`;
}
function localClock(minute: number): string {
  if (!Number.isInteger(minute) || minute < 0 || minute > MAX_TIMED_END_MINUTE)
    throw new RangeError('Mission clock minute is outside the supported range.');
  const normalized = minute % MINUTES_PER_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}
function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}
function addLocalDays(localDate: string, days: number): string {
  if (!LOCAL_DATE_PATTERN.test(localDate))
    throw new TypeError('Mission date must use YYYY-MM-DD format.');
  const date = new Date(`${localDate}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new TypeError('Mission date must be valid.');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function occurrenceDates(input: CalendarMissionCreateInput): readonly string[] {
  const recurrence = input.recurrence ?? null;
  if (recurrence === null) return [input.selectedDate];
  return expandRecurrenceDates({
    anchorLocalDate: input.selectedDate,
    recurrence,
    windowStartLocalDate: input.selectedDate,
    windowEndLocalDate: addLocalDays(input.selectedDate, RECURRENCE_MATERIALIZATION_DAYS),
  });
}

function buildSchedule(input: CalendarMissionCreateInput, localDate: string) {
  const allDay = input.allDay ?? false;
  if (allDay) {
    const estimatedEffortMinutes = input.estimatedEffortMinutes;
    if (estimatedEffortMinutes === null || estimatedEffortMinutes === undefined)
      throw new RangeError('Estimated effort minutes are required for an all-day mission.');
    assertPositiveInteger(estimatedEffortMinutes, 'Estimated effort minutes');
    return {
      schedule: createZonedAllDaySchedule({
        localDate,
        timeZone: input.timeZone,
        estimatedEffortMinutes,
      }),
      scheduledStart: null,
      scheduledEnd: null,
    } as const;
  }

  if (input.startMinute === null) throw new RangeError('Mission start minute is required.');
  if (input.endMinute === null) throw new RangeError('Mission end minute is required.');
  assertStartMinute(input.startMinute);
  assertEndMinute(input.endMinute);
  if (input.endMinute <= input.startMinute)
    throw new RangeError('Mission end must be after its start.');
  if (input.endMinute - input.startMinute > MINUTES_PER_DAY)
    throw new RangeError('Mission duration cannot exceed 24 hours.');
  return {
    schedule: createZonedTimedSchedule({
      localStart: localDateTime(localDate, input.startMinute),
      localFinish: localDateTime(localDate, input.endMinute),
      timeZone: input.timeZone,
      timeBehavior: input.timeBehavior ?? 'local_time',
    }),
    scheduledStart: localClock(input.startMinute),
    scheduledEnd: localClock(input.endMinute),
  } as const;
}

export async function createCalendarMission({
  database,
  accountId,
  deviceId,
  input,
  now,
  generateId,
}: CalendarMissionCreateOptions): Promise<CalendarMission> {
  assertNonEmpty(accountId, 'Account ID');
  assertNonEmpty(deviceId, 'Device ID');
  assertNonEmpty(input.title, 'Mission title');
  assertNonEmpty(input.timeZone, 'Time zone');

  const dates = occurrenceDates(input);
  if (dates.length === 0)
    throw new RangeError(
      'Recurrence does not create an occurrence in the bounded materialization window.',
    );
  const series = createMissionSeries({
    id: generateId(),
    title: input.title.trim(),
    recurrence: input.recurrence ?? null,
  });
  const occurredAt = now.toISOString();
  const location = optionalText(input.location);
  const notes = optionalText(input.notes);
  const queue = createMutationQueue(database, accountId);
  let firstMission: CalendarMission | null = null;

  for (const localDate of dates) {
    const built = buildSchedule(input, localDate);
    const placement = evaluateSchedulePlacement({
      targetStartInstant: built.schedule.startInstant,
      actionInstant: occurredAt,
      currentRewardEligibility: input.rewardEligibility,
    });
    if (!placement.allowed) {
      if (localDate === dates[0])
        throw new RangeError('Mission start is outside the historical window.');
      continue;
    }

    const occurrence = createMissionOccurrence({
      id: generateId(),
      seriesId: series.id,
      schedule: built.schedule,
      scheduleState: 'scheduled',
      completionState: 'incomplete',
      evidenceState: input.private === true ? 'not_required' : 'not_submitted',
      rewardEligibility: placement.rewardEligibility,
      rewardIssuance: 'not_issued',
      calendarSource: 'internal',
      fieldOwnership: 'app_owned',
      synchronizationState: 'pending',
      storyState: 'none',
      deletionState: 'active',
    });
    const mission: CalendarMission = Object.freeze({ series, occurrence });
    firstMission ??= mission;
    const mutationId = generateId();
    const payload = {
      series,
      occurrence,
      ...(location === null ? {} : { location }),
      ...(notes === null ? {} : { notes }),
    };

    await queue.enqueue({
      mutation: {
        mutationId,
        accountId,
        deviceId,
        entityType: 'mission',
        entityId: occurrence.id,
        operation: 'create',
        baseVersion: null,
        clientOccurredAt: occurredAt,
        payload,
      },
      destination: { kind: 'server' },
      applyLocal: async (transaction) => {
        await transaction.runAsync(
          `INSERT INTO cached_mission_series
            (account_id, series_id, title, timezone, payload_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(account_id, series_id) DO UPDATE SET
             title = excluded.title,
             timezone = excluded.timezone,
             payload_json = excluded.payload_json,
             updated_at = excluded.updated_at`,
          accountId,
          series.id,
          series.title,
          input.timeZone,
          JSON.stringify(series),
          occurredAt,
        );
        await transaction.runAsync(
          `INSERT INTO cached_mission_occurrences
            (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end, all_day, payload_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          accountId,
          occurrence.id,
          series.id,
          localDate,
          built.scheduledStart,
          built.scheduledEnd,
          (input.allDay ?? false) ? 1 : 0,
          JSON.stringify(occurrence),
          occurredAt,
        );
        await transaction.runAsync(
          `INSERT INTO search_documents
            (account_id, document_id, occurrence_id, title, location, provider_text, personal_note, general_note, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
          accountId,
          occurrence.id,
          occurrence.id,
          series.title,
          location,
          notes,
          occurredAt,
        );
      },
    });
  }

  if (firstMission === null)
    throw new RangeError('Recurrence did not create an eligible occurrence.');
  return firstMission;
}
