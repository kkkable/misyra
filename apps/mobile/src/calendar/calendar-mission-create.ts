import {
  createOneTimeMission,
  createZonedAllDaySchedule,
  createZonedTimedSchedule,
  evaluateSchedulePlacement,
  type OneTimeMission,
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

const MINUTES_PER_DAY = 24 * 60;
const MAX_TIMED_END_MINUTE = MINUTES_PER_DAY * 2;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
}

function localDateTime(localDate: string, minute: number): string {
  if (!LOCAL_DATE_PATTERN.test(localDate)) {
    throw new TypeError('Mission date must use YYYY-MM-DD format.');
  }
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
  if (!Number.isInteger(minute) || minute < 0 || minute > MAX_TIMED_END_MINUTE) {
    throw new RangeError('Mission clock minute is outside the supported range.');
  }
  const normalized = minute % MINUTES_PER_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

export async function createCalendarMission({
  database,
  accountId,
  deviceId,
  input,
  now,
  generateId,
}: CalendarMissionCreateOptions): Promise<OneTimeMission> {
  assertNonEmpty(accountId, 'Account ID');
  assertNonEmpty(deviceId, 'Device ID');
  assertNonEmpty(input.title, 'Mission title');
  assertNonEmpty(input.timeZone, 'Time zone');

  const allDay = input.allDay ?? false;
  let schedule;
  let scheduledStart: string | null;
  let scheduledEnd: string | null;

  if (allDay) {
    const estimatedEffortMinutes = input.estimatedEffortMinutes;
    if (estimatedEffortMinutes === null || estimatedEffortMinutes === undefined) {
      throw new RangeError('Estimated effort minutes are required for an all-day mission.');
    }
    assertPositiveInteger(estimatedEffortMinutes, 'Estimated effort minutes');
    schedule = createZonedAllDaySchedule({
      localDate: input.selectedDate,
      timeZone: input.timeZone,
      estimatedEffortMinutes,
    });
    scheduledStart = null;
    scheduledEnd = null;
  } else {
    if (input.startMinute === null) throw new RangeError('Mission start minute is required.');
    if (input.endMinute === null) throw new RangeError('Mission end minute is required.');
    assertStartMinute(input.startMinute);
    assertEndMinute(input.endMinute);
    if (input.endMinute <= input.startMinute) {
      throw new RangeError('Mission end must be after its start.');
    }
    if (input.endMinute - input.startMinute > MINUTES_PER_DAY) {
      throw new RangeError('Mission duration cannot exceed 24 hours.');
    }
    schedule = createZonedTimedSchedule({
      localStart: localDateTime(input.selectedDate, input.startMinute),
      localFinish: localDateTime(input.selectedDate, input.endMinute),
      timeZone: input.timeZone,
      timeBehavior: input.timeBehavior ?? 'local_time',
    });
    scheduledStart = localClock(input.startMinute);
    scheduledEnd = localClock(input.endMinute);
  }

  const placement = evaluateSchedulePlacement({
    targetStartInstant: schedule.startInstant,
    actionInstant: now.toISOString(),
    currentRewardEligibility: input.rewardEligibility,
  });
  if (!placement.allowed) throw new RangeError('Mission start is outside the historical window.');

  const seriesId = generateId();
  const occurrenceId = generateId();
  const mutationId = generateId();
  const mission = createOneTimeMission({
    series: {
      id: seriesId,
      title: input.title.trim(),
    },
    occurrence: {
      id: occurrenceId,
      schedule,
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
    },
  });
  const occurredAt = now.toISOString();
  const location = optionalText(input.location);
  const notes = optionalText(input.notes);
  const payload = {
    series: mission.series,
    occurrence: mission.occurrence,
    ...(location === null ? {} : { location }),
    ...(notes === null ? {} : { notes }),
  };
  const queue = createMutationQueue(database, accountId);

  await queue.enqueue({
    mutation: {
      mutationId,
      accountId,
      deviceId,
      entityType: 'mission',
      entityId: mission.occurrence.id,
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
         VALUES (?, ?, ?, ?, ?, ?)`,
        accountId,
        mission.series.id,
        mission.series.title,
        input.timeZone,
        JSON.stringify(mission.series),
        occurredAt,
      );
      await transaction.runAsync(
        `INSERT INTO cached_mission_occurrences
          (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end, all_day, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        accountId,
        mission.occurrence.id,
        mission.series.id,
        input.selectedDate,
        scheduledStart,
        scheduledEnd,
        allDay ? 1 : 0,
        JSON.stringify(mission.occurrence),
        occurredAt,
      );
      await transaction.runAsync(
        `INSERT INTO search_documents
          (account_id, document_id, occurrence_id, title, location, provider_text, personal_note, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
        accountId,
        mission.occurrence.id,
        mission.occurrence.id,
        mission.series.title,
        location,
        notes,
        occurredAt,
      );
    },
  });

  return mission;
}
