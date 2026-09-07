import {
  createMissionOccurrence,
  createZonedTimedSchedule,
  type MissionOccurrenceInput,
} from '@misyra/domain';

import { createMutationQueue, type MutationQueueDatabase } from '../storage/mutation-queue.js';
import type { MissionAdjustmentSave } from './calendar-mission-adjustment.js';

type CalendarMissionAdjustmentSaveOptions = Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  adjustment: MissionAdjustmentSave;
  now: Date;
  generateId: () => string;
}>;

type CachedOccurrenceRow = Readonly<{
  local_date: string;
  payload_json: string;
  server_version: number | null;
}>;

const MINUTES_PER_DAY = 24 * 60;

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new TypeError(`${label} must not be empty.`);
}

function assertMinute(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MINUTES_PER_DAY) {
    throw new RangeError(`${label} must be an integer from 0 to ${String(MINUTES_PER_DAY)}.`);
  }
}

function dateWithOffset(date: string, offset: number): string {
  const instant = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(instant.getTime())) {
    throw new TypeError('Mission date must use YYYY-MM-DD format.');
  }
  instant.setUTCDate(instant.getUTCDate() + offset);
  return instant.toISOString().slice(0, 10);
}

function localDateTime(date: string, minute: number): string {
  assertMinute(minute, 'Mission minute');
  const dayOffset = minute === MINUTES_PER_DAY ? 1 : 0;
  const minuteInDay = minute === MINUTES_PER_DAY ? 0 : minute;
  const hour = Math.floor(minuteInDay / 60);
  const minuteOfHour = minuteInDay % 60;
  return `${dateWithOffset(date, dayOffset)}T${String(hour).padStart(2, '0')}:${String(minuteOfHour).padStart(2, '0')}:00`;
}

function localClock(minute: number): string {
  assertMinute(minute, 'Mission minute');
  const normalized = minute === MINUTES_PER_DAY ? 0 : minute;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export async function saveCalendarMissionAdjustment({
  database,
  accountId,
  deviceId,
  adjustment,
  now,
  generateId,
}: CalendarMissionAdjustmentSaveOptions): Promise<void> {
  assertNonEmpty(accountId, 'Account ID');
  assertNonEmpty(deviceId, 'Device ID');
  assertNonEmpty(adjustment.missionId, 'Mission ID');
  assertMinute(adjustment.startMinute, 'Mission start minute');
  assertMinute(adjustment.endMinute, 'Mission end minute');
  if (adjustment.endMinute <= adjustment.startMinute) {
    throw new RangeError('Mission end must be after its start.');
  }

  const cached = await database.getFirstAsync<CachedOccurrenceRow>(
    `SELECT local_date, payload_json, server_version
       FROM cached_mission_occurrences
      WHERE account_id = ? AND occurrence_id = ?`,
    accountId,
    adjustment.missionId,
  );
  if (cached === null) throw new Error('Mission adjustment target was not found.');
  if (!Number.isSafeInteger(cached.server_version) || (cached.server_version ?? 0) <= 0) {
    throw new Error('Mission adjustment requires an authoritative server version.');
  }

  const occurrence = createMissionOccurrence(
    JSON.parse(cached.payload_json) as MissionOccurrenceInput,
  );
  if (
    occurrence.schedule.allDay ||
    occurrence.scheduleState !== 'scheduled' ||
    occurrence.completionState !== 'incomplete' ||
    occurrence.calendarSource !== 'internal' ||
    occurrence.fieldOwnership !== 'app_owned' ||
    occurrence.deletionState !== 'active'
  ) {
    throw new Error(
      'Mission direct manipulation requires an active unfinished app-owned timed mission.',
    );
  }

  const schedule = createZonedTimedSchedule({
    localStart: localDateTime(cached.local_date, adjustment.startMinute),
    localFinish: localDateTime(cached.local_date, adjustment.endMinute),
    timeZone: occurrence.schedule.timeZone,
    timeBehavior: occurrence.schedule.timeBehavior,
  });
  const rewardEligibility =
    occurrence.rewardEligibility === 'ineligible' ? 'ineligible' : adjustment.rewardEligibility;
  if (rewardEligibility !== 'eligible' && rewardEligibility !== 'ineligible') {
    throw new Error('Mission adjustment requires resolved XP eligibility.');
  }

  const baseVersion = cached.server_version as number;
  const nextVersion = baseVersion + 1;
  const occurredAt = now.toISOString();
  const mutationId = generateId();
  assertNonEmpty(mutationId, 'Mutation ID');
  const nextOccurrence = createMissionOccurrence({
    ...occurrence,
    schedule,
    rewardEligibility,
    synchronizationState: 'pending',
  });
  const queue = createMutationQueue(database, accountId);

  await queue.enqueue({
    mutation: {
      mutationId,
      accountId,
      deviceId,
      entityType: 'mission',
      entityId: adjustment.missionId,
      operation: 'update',
      baseVersion,
      clientOccurredAt: occurredAt,
      payload: { schedule, rewardEligibility },
    },
    destination: { kind: 'server' },
    applyLocal: async (transaction) => {
      const latest = await transaction.getFirstAsync<{ server_version: number | null }>(
        `SELECT server_version
           FROM cached_mission_occurrences
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        adjustment.missionId,
      );
      if (latest?.server_version !== baseVersion) {
        throw new Error('Mission adjustment cache version changed before save.');
      }
      await transaction.runAsync(
        `UPDATE cached_mission_occurrences
            SET local_date = ?,
                scheduled_start = ?,
                scheduled_end = ?,
                all_day = 0,
                payload_json = ?,
                server_version = ?,
                updated_at = ?
          WHERE account_id = ? AND occurrence_id = ?`,
        schedule.localStart.slice(0, 10),
        localClock(adjustment.startMinute),
        localClock(adjustment.endMinute),
        JSON.stringify(nextOccurrence),
        nextVersion,
        occurredAt,
        accountId,
        adjustment.missionId,
      );
    },
  });
}
