import {
  createOneTimeMission,
  createZonedTimedSchedule,
  evaluateSchedulePlacement,
  type OneTimeMission,
  type RewardEligibility,
} from '@misyra/domain';

import { createMutationQueue, type MutationQueueDatabase } from '../storage/mutation-queue.js';

export type CalendarMissionCreateInput = Readonly<{
  selectedDate: string;
  title: string;
  startMinute: number;
  endMinute: number;
  rewardEligibility: RewardEligibility;
}>;

type CalendarMissionCreateOptions = Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  timeZone: string;
  input: CalendarMissionCreateInput;
  now: Date;
  generateId: () => string;
}>;

const MINUTES_PER_DAY = 24 * 60;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new TypeError(`${label} must not be empty.`);
}

function assertMinute(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MINUTES_PER_DAY) {
    throw new RangeError(`${label} must be an integer from 0 to ${String(MINUTES_PER_DAY)}.`);
  }
}

function localDateTime(localDate: string, minute: number): string {
  if (!LOCAL_DATE_PATTERN.test(localDate)) {
    throw new TypeError('Mission date must use YYYY-MM-DD format.');
  }
  assertMinute(minute, 'Mission minute');
  if (minute === MINUTES_PER_DAY) {
    const date = new Date(`${localDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return `${date.toISOString().slice(0, 10)}T00:00:00`;
  }
  const hour = Math.floor(minute / 60);
  const minuteWithinHour = minute % 60;
  return `${localDate}T${String(hour).padStart(2, '0')}:${String(minuteWithinHour).padStart(2, '0')}:00`;
}

function localClock(minute: number): string {
  assertMinute(minute, 'Mission minute');
  const normalized = minute === MINUTES_PER_DAY ? 0 : minute;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export async function createCalendarMission({
  database,
  accountId,
  deviceId,
  timeZone,
  input,
  now,
  generateId,
}: CalendarMissionCreateOptions): Promise<OneTimeMission> {
  assertNonEmpty(accountId, 'Account ID');
  assertNonEmpty(deviceId, 'Device ID');
  assertNonEmpty(timeZone, 'Time zone');
  assertMinute(input.startMinute, 'Mission start minute');
  assertMinute(input.endMinute, 'Mission end minute');
  if (input.endMinute <= input.startMinute) {
    throw new RangeError('Mission end must be after its start.');
  }

  const schedule = createZonedTimedSchedule({
    localStart: localDateTime(input.selectedDate, input.startMinute),
    localFinish: localDateTime(input.selectedDate, input.endMinute),
    timeZone,
    timeBehavior: 'local_time',
  });
  const placement = evaluateSchedulePlacement({
    targetStartInstant: schedule.startInstant,
    actionInstant: now.toISOString(),
    currentRewardEligibility: 'undetermined',
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
      evidenceState: 'not_submitted',
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
  const payload = { series: mission.series, occurrence: mission.occurrence };
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
        timeZone,
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
        localClock(input.startMinute),
        localClock(input.endMinute),
        0,
        JSON.stringify(mission.occurrence),
        occurredAt,
      );
    },
  });

  return mission;
}
