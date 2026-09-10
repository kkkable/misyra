import {
  createMissionOccurrence,
  createMissionSeries,
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
import type { MissionAdjustmentSave } from './calendar-mission-adjustment.js';

type CalendarMissionAdjustmentSaveOptions = Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  adjustment: MissionAdjustmentSave;
  scope?: RecurringSeriesScope | undefined;
  now: Date;
  generateId: () => string;
  generateSeriesId?: (() => string) | undefined;
}>;

type CachedOccurrenceRow = Readonly<{
  occurrence_id: string;
  local_date: string;
  payload_json: string;
  server_version: number | null;
}>;

type CachedMissionRow = CachedOccurrenceRow &
  Readonly<{
    series_payload_json: string;
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

function minuteFromLocalDateTime(value: string): number {
  const match = /T(\d{2}):(\d{2}):\d{2}$/.exec(value);
  if (match === null) throw new TypeError('Mission local time is invalid.');
  return Number(match[1]) * 60 + Number(match[2]);
}

function resolveMissionAdjustmentBaseVersion(
  serverVersion: number | null,
  pendingCreate: boolean,
): number {
  if (serverVersion === null) {
    if (pendingCreate) return 1;
    throw new Error('Mission adjustment requires an authoritative or pending-create version.');
  }
  if (!Number.isSafeInteger(serverVersion) || serverVersion <= 0) {
    throw new Error('Mission adjustment requires an authoritative or pending-create version.');
  }
  return serverVersion;
}

function assertDirectManipulationOccurrence(occurrence: MissionOccurrence): void {
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
}

function adjustedSchedule(
  occurrence: MissionOccurrence,
  localDate: string,
  startMinute: number,
  endMinute: number,
) {
  return createZonedTimedSchedule({
    localStart: localDateTime(localDate, startMinute),
    localFinish: localDateTime(localDate, endMinute),
    timeZone: occurrence.schedule.timeZone,
    timeBehavior: occurrence.schedule.timeBehavior,
  });
}

function adjustedEligibility(
  occurrence: MissionOccurrence,
  targetStartInstant: string,
  requested: MissionAdjustmentSave['rewardEligibility'],
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
    currentRewardEligibility: afterEdit === 'ineligible' ? 'ineligible' : requested,
  });
  if (!placement.allowed) {
    throw new RangeError('Mission start is outside the historical window.');
  }
  return placement.rewardEligibility;
}

function splitSourceSeries(
  series: ReturnType<typeof createMissionSeries>,
  selectedLocalDate: string,
) {
  if (series.recurrence === null) {
    throw new Error('Recurring scope split requires a recurring series.');
  }
  return createMissionSeries({
    ...series,
    recurrence: {
      pattern: series.recurrence.pattern,
      end: { type: 'date', inclusiveLocalDate: dateWithOffset(selectedLocalDate, -1) },
    },
  });
}

export async function saveCalendarMissionAdjustment({
  database,
  accountId,
  deviceId,
  adjustment,
  scope,
  now,
  generateId,
  generateSeriesId,
}: CalendarMissionAdjustmentSaveOptions): Promise<void> {
  assertNonEmpty(accountId, 'Account ID');
  assertNonEmpty(deviceId, 'Device ID');
  assertNonEmpty(adjustment.missionId, 'Mission ID');
  assertMinute(adjustment.startMinute, 'Mission start minute');
  assertMinute(adjustment.endMinute, 'Mission end minute');
  if (adjustment.endMinute <= adjustment.startMinute) {
    throw new RangeError('Mission end must be after its start.');
  }

  const selectedRow = await database.getFirstAsync<CachedMissionRow>(
    `SELECT o.occurrence_id, o.local_date, o.payload_json, o.server_version,
            s.payload_json AS series_payload_json
       FROM cached_mission_occurrences o
       JOIN cached_mission_series s
         ON s.account_id = o.account_id AND s.series_id = o.series_id
      WHERE o.account_id = ? AND o.occurrence_id = ?`,
    accountId,
    adjustment.missionId,
  );
  if (selectedRow === null) throw new Error('Mission adjustment target was not found.');

  const selectedOccurrence = createMissionOccurrence(
    JSON.parse(selectedRow.payload_json) as MissionOccurrenceInput,
  );
  assertDirectManipulationOccurrence(selectedOccurrence);
  const sourceSeries = createMissionSeries(
    JSON.parse(selectedRow.series_payload_json) as MissionSeriesInput,
  );

  const recurring = sourceSeries.recurrence !== null;
  if (recurring && scope === undefined) {
    throw new Error('Recurring mission adjustments require an explicit scope.');
  }
  if (!recurring && scope !== undefined && scope !== 'this_occurrence') {
    throw new Error('Series scope requires a recurring mission.');
  }

  let rows: readonly CachedOccurrenceRow[] = [selectedRow];
  let affectedIds: readonly string[] = [adjustment.missionId];
  if (recurring) {
    rows = await database.getAllAsync<CachedOccurrenceRow>(
      `SELECT occurrence_id, local_date, payload_json, server_version
         FROM cached_mission_occurrences
        WHERE account_id = ? AND series_id = ?
        ORDER BY local_date, occurrence_id`,
      accountId,
      sourceSeries.id,
    );
    const occurrences = rows.map((row) =>
      createMissionOccurrence(JSON.parse(row.payload_json) as MissionOccurrenceInput),
    );
    const plan = planRecurringSeriesScope({
      series: sourceSeries,
      occurrences,
      selectedOccurrenceId: adjustment.missionId,
      scope: scope ?? 'this_occurrence',
      operation: 'edit',
    });
    affectedIds = plan.affectedOccurrenceIds;
  }

  const affectedSet = new Set(affectedIds);
  const affectedRows = rows.filter((row) => affectedSet.has(row.occurrence_id));
  if (affectedRows.length === 0) return;

  const selectedOriginalStart = minuteFromLocalDateTime(selectedOccurrence.schedule.localStart);
  const selectedTargetDuration = adjustment.endMinute - adjustment.startMinute;
  const startDelta = adjustment.startMinute - selectedOriginalStart;
  const actionInstant = now.toISOString();

  let targetSeries = sourceSeries;
  let truncatedSourceSeries: ReturnType<typeof createMissionSeries> | null = null;
  if (recurring && scope === 'this_and_future') {
    if (generateSeriesId === undefined) {
      throw new Error('This-and-future recurring adjustments require a series ID generator.');
    }
    const targetSeriesId = generateSeriesId();
    assertNonEmpty(targetSeriesId, 'Target series ID');
    targetSeries = createMissionSeries({
      id: targetSeriesId,
      title: sourceSeries.title,
      recurrence: sourceSeries.recurrence,
    });
    truncatedSourceSeries = splitSourceSeries(sourceSeries, selectedRow.local_date);
  }

  const queue = createMutationQueue(database, accountId);
  let first = true;
  for (const cached of affectedRows) {
    const occurrence = createMissionOccurrence(
      JSON.parse(cached.payload_json) as MissionOccurrenceInput,
    );
    assertDirectManipulationOccurrence(occurrence);
    const originalStart = minuteFromLocalDateTime(occurrence.schedule.localStart);
    const nextStart = originalStart + startDelta;
    const nextEnd = nextStart + selectedTargetDuration;
    assertMinute(nextStart, 'Scoped mission start minute');
    assertMinute(nextEnd, 'Scoped mission end minute');
    if (nextEnd <= nextStart) throw new RangeError('Mission end must be after its start.');

    const schedule = adjustedSchedule(occurrence, cached.local_date, nextStart, nextEnd);
    const rewardEligibility = adjustedEligibility(
      occurrence,
      schedule.startInstant,
      adjustment.rewardEligibility,
      actionInstant,
    );
    const baseVersion = resolveMissionAdjustmentBaseVersion(
      cached.server_version,
      occurrence.synchronizationState === 'pending',
    );
    const nextOccurrence = createMissionOccurrence({
      ...occurrence,
      seriesId: targetSeries.id,
      schedule,
      rewardEligibility,
      synchronizationState: 'pending',
    });
    const mutationId = generateId();
    assertNonEmpty(mutationId, 'Mutation ID');
    const sourceSeriesPayload =
      first && truncatedSourceSeries !== null
        ? {
            id: truncatedSourceSeries.id,
            recurrence: truncatedSourceSeries.recurrence,
          }
        : undefined;
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
          schedule,
          rewardEligibility,
          ...(recurring ? { series: targetSeries } : {}),
          ...(sourceSeriesPayload === undefined ? {} : { sourceSeries: sourceSeriesPayload }),
        },
      },
      destination: { kind: 'server' },
      applyLocal: async (transaction) => {
        if (sourceSeriesPayload !== undefined && truncatedSourceSeries !== null) {
          await transaction.runAsync(
            `UPDATE cached_mission_series
                SET payload_json = ?, updated_at = ?
              WHERE account_id = ? AND series_id = ?`,
            JSON.stringify(truncatedSourceSeries),
            actionInstant,
            accountId,
            sourceSeries.id,
          );
          await transaction.runAsync(
            `INSERT INTO cached_mission_series
              (account_id, series_id, title, timezone, payload_json, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            accountId,
            targetSeries.id,
            targetSeries.title,
            occurrence.schedule.timeZone,
            JSON.stringify(targetSeries),
            actionInstant,
          );
        }
        await transaction.runAsync(
          `UPDATE cached_mission_occurrences
              SET series_id = ?, local_date = ?, scheduled_start = ?, scheduled_end = ?, all_day = 0,
                  payload_json = ?, server_version = ?, updated_at = ?
            WHERE account_id = ? AND occurrence_id = ?`,
          targetSeries.id,
          schedule.localStart.slice(0, 10),
          localClock(nextStart),
          localClock(nextEnd),
          JSON.stringify(nextOccurrence),
          baseVersion + 1,
          actionInstant,
          accountId,
          occurrence.id,
        );
      },
    });
  }
}
