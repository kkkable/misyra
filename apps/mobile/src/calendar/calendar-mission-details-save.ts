import {
  createMissionOccurrence,
  createMissionSeries,
  createZonedAllDaySchedule,
  createZonedTimedSchedule,
  evaluateSchedulePlacement,
  planRecurringSeriesScope,
  resolveRewardEligibilityAfterEdit,
  type MissionOccurrence,
  type MissionOccurrenceInput,
  type MissionSeriesInput,
  type RecurringSeriesScope,
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
  scope?: RecurringSeriesScope | undefined;
  now: Date;
  generateId: () => string;
  generateSeriesId?: (() => string) | undefined;
}>;

type CachedMissionRow = Readonly<{
  occurrence_id: string;
  local_date: string;
  occurrence_payload_json: string;
  series_payload_json: string;
  server_version: number | null;
}>;

type CachedOccurrenceRow = Readonly<{
  occurrence_id: string;
  local_date: string;
  payload_json: string;
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

function dateWithOffset(date: string, offset: number): string {
  if (!LOCAL_DATE_PATTERN.test(date))
    throw new TypeError('Mission date must use YYYY-MM-DD format.');
  const instant = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(instant.getTime())) throw new TypeError('Mission date must be valid.');
  instant.setUTCDate(instant.getUTCDate() + offset);
  return instant.toISOString().slice(0, 10);
}

function dayDifference(from: string, to: string): number {
  const start = new Date(`${from}T12:00:00.000Z`).getTime();
  const finish = new Date(`${to}T12:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(finish)) {
    throw new TypeError('Mission date must be valid.');
  }
  return Math.round((finish - start) / (24 * 60 * 60 * 1000));
}

function localDateTime(localDate: string, minute: number): string {
  if (!LOCAL_DATE_PATTERN.test(localDate))
    throw new TypeError('Mission date must use YYYY-MM-DD format.');
  if (!Number.isInteger(minute) || minute < 0 || minute > MAX_TIMED_END_MINUTE) {
    throw new RangeError('Mission minute is outside the supported range.');
  }
  const dayOffset = Math.floor(minute / MINUTES_PER_DAY);
  const minuteWithinDay = minute % MINUTES_PER_DAY;
  return `${dateWithOffset(localDate, dayOffset)}T${String(Math.floor(minuteWithinDay / 60)).padStart(2, '0')}:${String(minuteWithinDay % 60).padStart(2, '0')}:00`;
}

function localClock(minute: number): string {
  const normalized = minute % MINUTES_PER_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function minuteFromLocalDateTime(value: string): number {
  const match = /T(\d{2}):(\d{2}):\d{2}$/.exec(value);
  if (match === null) throw new TypeError('Mission local time is invalid.');
  return Number(match[1]) * 60 + Number(match[2]);
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

function assertEditable(occurrence: MissionOccurrence): void {
  if (
    occurrence.fieldOwnership !== 'app_owned' ||
    occurrence.calendarSource !== 'internal' ||
    occurrence.scheduleState !== 'scheduled' ||
    occurrence.completionState !== 'incomplete' ||
    occurrence.deletionState !== 'active'
  ) {
    throw new Error('Mission fields are not editable.');
  }
}

function splitSourceSeries(
  series: ReturnType<typeof createMissionSeries>,
  selectedLocalDate: string,
) {
  if (series.recurrence === null)
    throw new Error('Recurring scope split requires a recurring series.');
  return createMissionSeries({
    ...series,
    recurrence: {
      pattern: series.recurrence.pattern,
      end: { type: 'date', inclusiveLocalDate: dateWithOffset(selectedLocalDate, -1) },
    },
  });
}

function scheduleForEdit(
  occurrence: MissionOccurrence,
  localDate: string,
  startMinute: number | null,
  endMinute: number | null,
  timeZone: string,
) {
  if (occurrence.schedule.allDay) {
    const estimatedEffortMinutes = occurrence.schedule.estimatedEffortMinutes;
    if (estimatedEffortMinutes === null) {
      throw new RangeError('All-day missions require estimated effort minutes.');
    }
    return createZonedAllDaySchedule({
      localDate,
      timeZone,
      estimatedEffortMinutes,
    });
  }
  if (startMinute === null || endMinute === null) {
    throw new RangeError('Timed Mission Details edits require start and end times.');
  }
  if (
    !Number.isInteger(startMinute) ||
    startMinute < 0 ||
    startMinute > MINUTES_PER_DAY ||
    !Number.isInteger(endMinute) ||
    endMinute <= startMinute ||
    endMinute > MAX_TIMED_END_MINUTE ||
    endMinute - startMinute > MINUTES_PER_DAY
  ) {
    throw new RangeError('Mission start and end times are invalid.');
  }
  return createZonedTimedSchedule({
    localStart: localDateTime(localDate, startMinute),
    localFinish: localDateTime(localDate, endMinute),
    timeZone,
    timeBehavior: occurrence.schedule.timeBehavior,
  });
}

function eligibilityForEdit(
  occurrence: MissionOccurrence,
  targetStartInstant: string,
  actionInstant: string,
) {
  const afterEdit = resolveRewardEligibilityAfterEdit({
    scheduledStartInstant: occurrence.schedule.startInstant,
    savedAtInstant: actionInstant,
    currentRewardEligibility: occurrence.rewardEligibility,
  });
  const placement = evaluateSchedulePlacement({
    targetStartInstant,
    actionInstant,
    currentRewardEligibility: afterEdit,
  });
  if (!placement.allowed) throw new RangeError('Mission start is outside the historical window.');
  return placement.rewardEligibility;
}

export async function saveCalendarMissionDetails({
  database,
  accountId,
  deviceId,
  edit,
  scope,
  now,
  generateId,
  generateSeriesId,
}: SaveOptions) {
  assertNonEmpty(accountId, 'Account ID');
  assertNonEmpty(deviceId, 'Device ID');
  assertNonEmpty(edit.missionId, 'Mission ID');
  assertNonEmpty(edit.title, 'Mission title');
  assertNonEmpty(edit.timeZone, 'Time zone');

  const row = await database.getFirstAsync<CachedMissionRow>(
    `SELECT o.occurrence_id, o.local_date,
            o.payload_json AS occurrence_payload_json,
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
  assertEditable(currentOccurrence);

  const recurring = currentSeries.recurrence !== null;
  if (recurring && scope === undefined) {
    throw new Error('Recurring mission edits require an explicit scope.');
  }
  if (!recurring && scope !== undefined && scope !== 'this_occurrence') {
    throw new Error('Series scope requires a recurring mission.');
  }

  const targetTimeZone = edit.timeZone.trim();
  const selectedSchedule = scheduleForEdit(
    currentOccurrence,
    edit.selectedDate,
    edit.startMinute,
    edit.endMinute,
    targetTimeZone,
  );
  const actionInstant = now.toISOString();
  eligibilityForEdit(currentOccurrence, selectedSchedule.startInstant, actionInstant);

  let cachedRows: readonly CachedOccurrenceRow[] = [
    {
      occurrence_id: row.occurrence_id,
      local_date: row.local_date,
      payload_json: row.occurrence_payload_json,
      server_version: row.server_version,
    },
  ];
  let affectedIds: readonly string[] = [edit.missionId];
  if (recurring) {
    cachedRows = await database.getAllAsync<CachedOccurrenceRow>(
      `SELECT occurrence_id, local_date, payload_json, server_version
         FROM cached_mission_occurrences
        WHERE account_id = ? AND series_id = ?
        ORDER BY local_date, occurrence_id`,
      accountId,
      currentSeries.id,
    );
    const occurrences = cachedRows.map((cached) =>
      createMissionOccurrence(JSON.parse(cached.payload_json) as MissionOccurrenceInput),
    );
    affectedIds = planRecurringSeriesScope({
      series: currentSeries,
      occurrences,
      selectedOccurrenceId: edit.missionId,
      scope: scope ?? 'this_occurrence',
      operation: 'edit',
    }).affectedOccurrenceIds;
  }

  const affectedSet = new Set(affectedIds);
  const affectedRows = cachedRows.filter((cached) => affectedSet.has(cached.occurrence_id));
  if (affectedRows.length === 0)
    throw new Error('Recurring mission scope contains no editable occurrence.');

  const originalSelectedDate = currentOccurrence.schedule.localStart.slice(0, 10);
  const dateDelta = dayDifference(originalSelectedDate, edit.selectedDate);
  const originalSelectedStart = currentOccurrence.schedule.allDay
    ? null
    : minuteFromLocalDateTime(currentOccurrence.schedule.localStart);
  const targetDuration =
    currentOccurrence.schedule.allDay || edit.startMinute === null || edit.endMinute === null
      ? null
      : edit.endMinute - edit.startMinute;
  const timeDelta =
    originalSelectedStart === null || edit.startMinute === null
      ? 0
      : edit.startMinute - originalSelectedStart;

  let targetSeries = createMissionSeries({ ...currentSeries, title: edit.title.trim() });
  let sourceSeriesUpdate: ReturnType<typeof createMissionSeries> | null = null;
  if (recurring && scope === 'this_occurrence') {
    if (generateSeriesId === undefined) {
      throw new Error('This-occurrence recurring edits require a series ID generator.');
    }
    targetSeries = createMissionSeries({
      id: generateSeriesId(),
      title: edit.title.trim(),
      recurrence: null,
    });
  } else if (recurring && scope === 'this_and_future') {
    if (generateSeriesId === undefined) {
      throw new Error('This-and-future recurring edits require a series ID generator.');
    }
    targetSeries = createMissionSeries({
      id: generateSeriesId(),
      title: edit.title.trim(),
      recurrence: currentSeries.recurrence,
    });
    sourceSeriesUpdate = splitSourceSeries(currentSeries, originalSelectedDate);
  }

  const location = optionalText(edit.location);
  const notes = optionalText(edit.notes);
  const queue = createMutationQueue(database, accountId);
  let first = true;
  const savedOccurrences: MissionOccurrence[] = [];

  for (const cached of affectedRows) {
    const occurrence = createMissionOccurrence(
      JSON.parse(cached.payload_json) as MissionOccurrenceInput,
    );
    assertEditable(occurrence);
    const nextDate = dateWithOffset(occurrence.schedule.localStart.slice(0, 10), dateDelta);
    let nextStart: number | null = null;
    let nextEnd: number | null = null;
    if (!occurrence.schedule.allDay) {
      const originalStart = minuteFromLocalDateTime(occurrence.schedule.localStart);
      nextStart = originalStart + timeDelta;
      nextEnd = targetDuration === null ? null : nextStart + targetDuration;
    }
    const schedule = scheduleForEdit(occurrence, nextDate, nextStart, nextEnd, targetTimeZone);
    const rewardEligibility = eligibilityForEdit(occurrence, schedule.startInstant, actionInstant);
    const nextOccurrence = createMissionOccurrence({
      ...occurrence,
      seriesId: targetSeries.id,
      schedule,
      rewardEligibility,
      synchronizationState: 'pending',
    });
    const baseVersion = await resolveBaseVersion(
      database,
      accountId,
      occurrence.id,
      cached.server_version,
    );
    const mutationId = generateId();
    assertNonEmpty(mutationId, 'Mutation ID');
    const sourceSeriesPayload =
      first && sourceSeriesUpdate !== null
        ? { id: sourceSeriesUpdate.id, recurrence: sourceSeriesUpdate.recurrence }
        : undefined;
    const shouldCreateTarget = first && targetSeries.id !== currentSeries.id;
    const shouldUpdateCurrentSeries = first && targetSeries.id === currentSeries.id;
    first = false;

    await queue.enqueue({
      mutation: {
        mutationId,
        accountId,
        deviceId,
        entityType: 'mission',
        entityId: occurrence.id,
        operation: 'update',
        baseVersion,
        clientOccurredAt: actionInstant,
        payload: {
          kind: 'details',
          title: targetSeries.title,
          schedule,
          rewardEligibility,
          location,
          notes,
          ...(recurring ? { series: targetSeries } : {}),
          ...(sourceSeriesPayload === undefined ? {} : { sourceSeries: sourceSeriesPayload }),
        },
      },
      destination: { kind: 'server' },
      applyLocal: async (transaction) => {
        if (sourceSeriesPayload !== undefined && sourceSeriesUpdate !== null) {
          await transaction.runAsync(
            `UPDATE cached_mission_series
                SET payload_json = ?, updated_at = ?
              WHERE account_id = ? AND series_id = ?`,
            JSON.stringify(sourceSeriesUpdate),
            actionInstant,
            accountId,
            currentSeries.id,
          );
        }
        if (shouldCreateTarget) {
          await transaction.runAsync(
            `INSERT INTO cached_mission_series
              (account_id, series_id, title, timezone, payload_json, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            accountId,
            targetSeries.id,
            targetSeries.title,
            targetTimeZone,
            JSON.stringify(targetSeries),
            actionInstant,
          );
        } else if (shouldUpdateCurrentSeries) {
          await transaction.runAsync(
            `UPDATE cached_mission_series
                SET title = ?, timezone = ?, payload_json = ?, updated_at = ?
              WHERE account_id = ? AND series_id = ?`,
            targetSeries.title,
            targetTimeZone,
            JSON.stringify(targetSeries),
            actionInstant,
            accountId,
            currentSeries.id,
          );
        }
        await transaction.runAsync(
          `UPDATE cached_mission_occurrences
              SET series_id = ?, local_date = ?, scheduled_start = ?, scheduled_end = ?, all_day = ?,
                  payload_json = ?, updated_at = ?, server_version = ?
            WHERE account_id = ? AND occurrence_id = ?`,
          targetSeries.id,
          schedule.localStart.slice(0, 10),
          schedule.allDay ? null : localClock(nextStart ?? 0),
          schedule.allDay ? null : localClock(nextEnd ?? 0),
          schedule.allDay ? 1 : 0,
          JSON.stringify(nextOccurrence),
          actionInstant,
          baseVersion + 1,
          accountId,
          occurrence.id,
        );
        await transaction.runAsync(
          `UPDATE search_documents
              SET title = ?, location = ?, general_note = ?, updated_at = ?
            WHERE account_id = ? AND occurrence_id = ?`,
          targetSeries.title,
          location,
          notes,
          actionInstant,
          accountId,
          occurrence.id,
        );
      },
    });
    savedOccurrences.push(nextOccurrence);
  }

  const selectedOccurrence =
    savedOccurrences.find((occurrence) => occurrence.id === edit.missionId) ?? savedOccurrences[0];
  if (selectedOccurrence === undefined)
    throw new Error('Mission Details save produced no occurrence.');
  return Object.freeze({
    series: targetSeries,
    occurrence: selectedOccurrence,
    occurrences: Object.freeze(savedOccurrences),
    location,
    notes,
  });
}
