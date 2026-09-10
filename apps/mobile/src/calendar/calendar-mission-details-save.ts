import {
  createMissionOccurrence,
  createMissionSeries,
  createZonedAllDaySchedule,
  createZonedTimedSchedule,
  evaluateSchedulePlacement,
  type MissionOccurrenceInput,
  type MissionSeriesInput,
} from '@misyra/domain';

import { createMutationQueue, type MutationQueueDatabase } from '../storage/mutation-queue.js';

const MINUTES_PER_DAY = 24 * 60;
const MAX_TIMED_END_MINUTE = MINUTES_PER_DAY * 2;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type MissionEdit = Readonly<{
  missionId: string;
  title: string;
  selectedDate: string;
  startMinute: number | null;
  endMinute: number | null;
  timeZone: string;
  location: string | null;
  notes: string | null;
}>;

type SaveOptions = Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  edit: MissionEdit;
  now: Date;
  generateId: () => string;
}>;

type CachedMissionRow = Readonly<{
  occurrence_payload_json: string;
  series_payload_json: string;
  server_version: number | null;
}>;

type PendingMutationRow = Readonly<{ command_json: string }>;

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new TypeError(`${label} must not be empty.`);
}

function optionalText(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

function localDateTime(localDate: string, minute: number): string {
  if (!LOCAL_DATE_PATTERN.test(localDate))
    throw new TypeError('Mission date must use YYYY-MM-DD format.');
  if (!Number.isInteger(minute) || minute < 0 || minute > MAX_TIMED_END_MINUTE) {
    throw new RangeError('Mission minute is outside the supported range.');
  }
  const dayOffset = Math.floor(minute / MINUTES_PER_DAY);
  const minuteWithinDay = minute % MINUTES_PER_DAY;
  const date = new Date(`${localDate}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new TypeError('Mission date must be valid.');
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return `${date.toISOString().slice(0, 10)}T${String(Math.floor(minuteWithinDay / 60)).padStart(2, '0')}:${String(minuteWithinDay % 60).padStart(2, '0')}:00`;
}

function localClock(minute: number): string {
  const normalized = minute % MINUTES_PER_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

async function resolveBaseVersion(
  database: MutationQueueDatabase,
  accountId: string,
  missionId: string,
  serverVersion: number | null,
): Promise<number> {
  if (serverVersion !== null) return serverVersion;
  const pending = await database.getAllAsync<PendingMutationRow>(
    `SELECT command_json FROM mutation_queue
      WHERE account_id = ? ORDER BY sequence`,
    accountId,
  );
  const hasPendingCreate = pending.some((row) => {
    const command = JSON.parse(row.command_json) as {
      mutation?: { entityType?: string; entityId?: string; operation?: string };
    };
    return (
      command.mutation?.entityType === 'mission' &&
      command.mutation.entityId === missionId &&
      command.mutation.operation === 'create'
    );
  });
  if (!hasPendingCreate) throw new Error('Mission has no authoritative version or pending create.');
  return 1;
}

export async function saveCalendarMissionDetails({
  database,
  accountId,
  deviceId,
  edit,
  now,
  generateId,
}: SaveOptions) {
  assertNonEmpty(accountId, 'Account ID');
  assertNonEmpty(deviceId, 'Device ID');
  assertNonEmpty(edit.missionId, 'Mission ID');
  assertNonEmpty(edit.title, 'Mission title');
  assertNonEmpty(edit.timeZone, 'Time zone');

  const row = await database.getFirstAsync<CachedMissionRow>(
    `SELECT o.payload_json AS occurrence_payload_json,
            s.payload_json AS series_payload_json,
            o.server_version
       FROM cached_mission_occurrences o
       JOIN cached_mission_series s
         ON s.account_id = o.account_id AND s.series_id = o.series_id
      WHERE o.account_id = ? AND o.occurrence_id = ?`,
    accountId,
    edit.missionId,
  );
  if (row === null) throw new Error('Mission is not available in the local cache.');

  const currentOccurrence = createMissionOccurrence(
    JSON.parse(row.occurrence_payload_json) as MissionOccurrenceInput,
  );
  const currentSeries = createMissionSeries(
    JSON.parse(row.series_payload_json) as MissionSeriesInput,
  );
  if (
    currentOccurrence.fieldOwnership !== 'app_owned' ||
    currentOccurrence.calendarSource !== 'internal' ||
    currentOccurrence.scheduleState !== 'scheduled' ||
    currentOccurrence.completionState !== 'incomplete' ||
    currentOccurrence.deletionState !== 'active'
  ) {
    throw new Error('Mission fields are not editable.');
  }
  if (currentSeries.recurrence !== null) {
    throw new Error('Recurring mission edits require MTS-052 scope selection.');
  }

  const allDay = currentOccurrence.schedule.allDay;
  let schedule;
  let scheduledStart: string | null;
  let scheduledEnd: string | null;
  if (allDay) {
    const estimatedEffortMinutes = currentOccurrence.schedule.estimatedEffortMinutes;
    if (estimatedEffortMinutes === null) {
      throw new RangeError('All-day missions require estimated effort minutes.');
    }
    schedule = createZonedAllDaySchedule({
      localDate: edit.selectedDate,
      timeZone: edit.timeZone.trim(),
      estimatedEffortMinutes,
    });
    scheduledStart = null;
    scheduledEnd = null;
  } else {
    if (edit.startMinute === null || edit.endMinute === null) {
      throw new RangeError('Timed Mission Details edits require start and end times.');
    }
    if (
      !Number.isInteger(edit.startMinute) ||
      edit.startMinute < 0 ||
      edit.startMinute > MINUTES_PER_DAY ||
      !Number.isInteger(edit.endMinute) ||
      edit.endMinute <= edit.startMinute ||
      edit.endMinute > MAX_TIMED_END_MINUTE ||
      edit.endMinute - edit.startMinute > MINUTES_PER_DAY
    ) {
      throw new RangeError('Mission start and end times are invalid.');
    }
    schedule = createZonedTimedSchedule({
      localStart: localDateTime(edit.selectedDate, edit.startMinute),
      localFinish: localDateTime(edit.selectedDate, edit.endMinute),
      timeZone: edit.timeZone.trim(),
      timeBehavior: currentOccurrence.schedule.timeBehavior,
    });
    scheduledStart = localClock(edit.startMinute);
    scheduledEnd = localClock(edit.endMinute);
  }

  const actionInstant = now.toISOString();
  const editedAfterStart =
    new Date(actionInstant).getTime() >=
    new Date(currentOccurrence.schedule.startInstant).getTime();
  const placement = evaluateSchedulePlacement({
    targetStartInstant: schedule.startInstant,
    actionInstant,
    currentRewardEligibility: editedAfterStart ? 'ineligible' : currentOccurrence.rewardEligibility,
  });
  if (!placement.allowed) throw new RangeError('Mission start is outside the historical window.');

  const series = createMissionSeries({ ...currentSeries, title: edit.title.trim() });
  const occurrence = createMissionOccurrence({
    ...currentOccurrence,
    schedule,
    rewardEligibility: placement.rewardEligibility,
    synchronizationState: 'pending',
  });
  const location = optionalText(edit.location);
  const notes = optionalText(edit.notes);
  const baseVersion = await resolveBaseVersion(
    database,
    accountId,
    edit.missionId,
    row.server_version,
  );
  const mutationId = generateId();
  const queue = createMutationQueue(database, accountId);

  await queue.enqueue({
    mutation: {
      mutationId,
      accountId,
      deviceId,
      entityType: 'mission',
      entityId: edit.missionId,
      operation: 'update',
      baseVersion,
      clientOccurredAt: actionInstant,
      payload: {
        kind: 'details',
        title: series.title,
        schedule,
        rewardEligibility: occurrence.rewardEligibility,
        location,
        notes,
      },
    },
    destination: { kind: 'server' },
    applyLocal: async (transaction) => {
      await transaction.runAsync(
        `UPDATE cached_mission_series
            SET title = ?, timezone = ?, payload_json = ?, updated_at = ?
          WHERE account_id = ? AND series_id = ?`,
        series.title,
        edit.timeZone.trim(),
        JSON.stringify(series),
        actionInstant,
        accountId,
        series.id,
      );
      await transaction.runAsync(
        `UPDATE cached_mission_occurrences
            SET local_date = ?, scheduled_start = ?, scheduled_end = ?, all_day = ?,
                payload_json = ?, updated_at = ?, server_version = ?
          WHERE account_id = ? AND occurrence_id = ?`,
        edit.selectedDate,
        scheduledStart,
        scheduledEnd,
        allDay ? 1 : 0,
        JSON.stringify(occurrence),
        actionInstant,
        baseVersion + 1,
        accountId,
        edit.missionId,
      );
      await transaction.runAsync(
        `UPDATE search_documents
            SET title = ?, location = ?, general_note = ?, updated_at = ?
          WHERE account_id = ? AND occurrence_id = ?`,
        series.title,
        location,
        notes,
        actionInstant,
        accountId,
        edit.missionId,
      );
    },
  });

  return Object.freeze({ series, occurrence, location, notes });
}
