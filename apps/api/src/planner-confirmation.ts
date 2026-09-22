import { createHash, randomUUID } from 'node:crypto';

import { appendAccountChange, executeIdempotentCommand } from '@misyra/database';
import {
  createMissionOccurrence,
  createMissionSeries,
  createZonedAllDaySchedule,
  createZonedTimedSchedule,
  evaluateSchedulePlacement,
  type MissionOccurrence,
  type MissionSchedule,
  type MissionSeries,
} from '@misyra/domain';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

export type PlannerConfirmationInput = Readonly<{
  accountId: string;
  idempotencyKey: string;
  now?: Date;
}>;

export type PlannerConfirmationResult = Readonly<{
  missionCount: number;
  calendarDate: string;
  occurrenceIds: readonly string[];
}>;

export class PlannerConfirmationInvalidDraftError extends Error {
  constructor(message = 'Planner draft cannot be activated.') {
    super(message);
    this.name = 'PlannerConfirmationInvalidDraftError';
  }
}

type PlannerDraftItemBase = Readonly<{
  id: string;
  title: string;
  localDate: string;
  estimatedMinutes: number;
  timeZone: string;
  location?: string;
  notes?: string;
}>;

type PlannerDraftItem =
  | Readonly<PlannerDraftItemBase & { allDay: true }>
  | Readonly<
      PlannerDraftItemBase & {
        allDay: false;
        startLocalTime: string;
        endLocalTime: string;
      }
    >;

interface PlannerItemRow extends QueryResultRow {
  id: string;
  payload: unknown;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_PER_DAY = 24 * 60;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function requestHash(input: PlannerConfirmationInput): string {
  return createHash('sha256')
    .update(JSON.stringify({ accountId: input.accountId }))
    .digest('hex');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PlannerConfirmationInvalidDraftError('Planner draft item must be an object.');
  }
  return value as Record<string, unknown>;
}

function requiredString(source: Record<string, unknown>, key: string, label: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PlannerConfirmationInvalidDraftError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
  label: string,
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new PlannerConfirmationInvalidDraftError(`${label} must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function timeMinute(value: string, label: string): number {
  if (!LOCAL_TIME_PATTERN.test(value)) {
    throw new PlannerConfirmationInvalidDraftError(`${label} must use HH:mm format.`);
  }
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function minuteTime(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= MINUTES_PER_DAY) {
    throw new PlannerConfirmationInvalidDraftError('Planner draft time falls outside one day.');
  }
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(
    2,
    '0',
  )}`;
}

function parseDraftItem(row: PlannerItemRow): PlannerDraftItem {
  const source = asRecord(row.payload);
  const id = requiredString(source, 'id', 'Planner draft item id');
  if (!UUID_PATTERN.test(id) || id !== row.id) {
    throw new PlannerConfirmationInvalidDraftError('Planner draft item id is invalid.');
  }
  const title = requiredString(source, 'title', 'Planner draft item title');
  const localDate = requiredString(source, 'localDate', 'Planner draft item date');
  if (!LOCAL_DATE_PATTERN.test(localDate)) {
    throw new PlannerConfirmationInvalidDraftError('Planner draft item date is invalid.');
  }
  const parsedDate = new Date(`${localDate}T12:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== localDate) {
    throw new PlannerConfirmationInvalidDraftError('Planner draft item date is invalid.');
  }
  if (typeof source.allDay !== 'boolean') {
    throw new PlannerConfirmationInvalidDraftError('Planner draft all-day value is invalid.');
  }
  if (!Number.isSafeInteger(source.estimatedMinutes) || (source.estimatedMinutes as number) <= 0) {
    throw new PlannerConfirmationInvalidDraftError(
      'Planner draft estimated minutes must be positive.',
    );
  }
  const estimatedMinutes = source.estimatedMinutes as number;
  const timeZone = requiredString(source, 'timeZone', 'Planner draft item time zone');
  const location = optionalString(source, 'location', 'Planner draft item location');
  const notes = optionalString(source, 'notes', 'Planner draft item notes');

  if (source.allDay) {
    if (source.startLocalTime !== undefined || source.endLocalTime !== undefined) {
      throw new PlannerConfirmationInvalidDraftError(
        'All-day Planner draft items cannot contain times.',
      );
    }
    return {
      id,
      title,
      localDate,
      allDay: true,
      estimatedMinutes,
      timeZone,
      ...(location === undefined ? {} : { location }),
      ...(notes === undefined ? {} : { notes }),
    };
  }

  const startLocalTime = requiredString(source, 'startLocalTime', 'Planner draft item start time');
  const startMinute = timeMinute(startLocalTime, 'Planner draft item start time');
  const suppliedEnd = optionalString(source, 'endLocalTime', 'Planner draft item end time');
  const endMinute =
    suppliedEnd === undefined
      ? startMinute + estimatedMinutes
      : timeMinute(suppliedEnd, 'Planner draft item end time');
  if (endMinute <= startMinute || endMinute >= MINUTES_PER_DAY + 1) {
    throw new PlannerConfirmationInvalidDraftError(
      'Planner draft item must end later on the same Calendar day.',
    );
  }
  const endLocalTime = suppliedEnd ?? minuteTime(endMinute);
  return {
    id,
    title,
    localDate,
    startLocalTime,
    endLocalTime,
    allDay: false,
    estimatedMinutes,
    timeZone,
    ...(location === undefined ? {} : { location }),
    ...(notes === undefined ? {} : { notes }),
  };
}

function scheduleFor(item: PlannerDraftItem): MissionSchedule {
  try {
    if (item.allDay) {
      return createZonedAllDaySchedule({
        localDate: item.localDate,
        timeZone: item.timeZone,
        estimatedEffortMinutes: item.estimatedMinutes,
      });
    }
    return createZonedTimedSchedule({
      localStart: `${item.localDate}T${item.startLocalTime}:00`,
      localFinish: `${item.localDate}T${item.endLocalTime}:00`,
      timeZone: item.timeZone,
      timeBehavior: 'local_time',
    });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw new PlannerConfirmationInvalidDraftError(error.message);
    }
    throw error;
  }
}

function authoritativePayload(
  series: MissionSeries,
  occurrence: MissionOccurrence,
  item: PlannerDraftItem,
) {
  return {
    series,
    occurrence,
    location: item.location ?? null,
    notes: item.notes ?? null,
  } as const;
}

async function activateItem(
  client: PoolClient,
  accountId: string,
  row: PlannerItemRow,
  now: Date,
): Promise<
  Readonly<{ occurrence: MissionOccurrence; series: MissionSeries; item: PlannerDraftItem }>
> {
  const item = parseDraftItem(row);
  const schedule = scheduleFor(item);
  const placement = evaluateSchedulePlacement({
    targetStartInstant: schedule.startInstant,
    actionInstant: now.toISOString(),
    currentRewardEligibility: 'eligible',
  });
  if (!placement.allowed) {
    throw new PlannerConfirmationInvalidDraftError(
      'Planner draft mission is outside the supported historical window.',
    );
  }

  const series = createMissionSeries({
    id: randomUUID(),
    title: item.title,
    recurrence: null,
  });
  const occurrence = createMissionOccurrence({
    id: item.id,
    seriesId: series.id,
    schedule,
    scheduleState: 'scheduled',
    completionState: 'incomplete',
    evidenceState: 'not_submitted',
    rewardEligibility: placement.rewardEligibility,
    rewardIssuance: 'not_issued',
    calendarSource: 'internal',
    fieldOwnership: 'app_owned',
    synchronizationState: 'synced',
    storyState: 'none',
    deletionState: 'active',
  });

  await client.query(
    `INSERT INTO mission_series (id, account_id, title, recurrence_rule)
     VALUES ($1, $2, $3, NULL)`,
    [series.id, accountId, series.title],
  );
  await client.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day,
       estimated_effort_minutes, schedule_state, completion_state, evidence_state,
       reward_eligibility, reward_issuance, calendar_source, field_ownership,
       synchronization_state, story_state, deletion_state, location, notes
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11,
       $12, $13, $14, $15,
       $16, $17, $18, $19,
       'synced', $20, $21, $22, $23
     )`,
    [
      occurrence.id,
      accountId,
      series.id,
      item.localDate,
      schedule.localStart,
      schedule.localFinish,
      schedule.startInstant,
      schedule.finishInstant,
      schedule.timeZone,
      schedule.timeBehavior,
      schedule.allDay,
      schedule.estimatedEffortMinutes,
      occurrence.scheduleState,
      occurrence.completionState,
      occurrence.evidenceState,
      occurrence.rewardEligibility,
      occurrence.rewardIssuance,
      occurrence.calendarSource,
      occurrence.fieldOwnership,
      occurrence.storyState,
      occurrence.deletionState,
      item.location ?? null,
      item.notes ?? null,
    ],
  );

  return { occurrence, series, item };
}

export function confirmPlannerDraft(
  pool: Pool,
  input: PlannerConfirmationInput,
): Promise<PlannerConfirmationResult> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + IDEMPOTENCY_TTL_MS);

  return executeIdempotentCommand(pool, {
    accountId: input.accountId,
    key: input.idempotencyKey,
    requestHash: requestHash(input),
    expiresAt,
    async work(context) {
      const draft = await context.client.query<{ id: string }>(
        `SELECT id
           FROM ai_planner_drafts
          WHERE account_id = $1
            AND status = 'draft'
          FOR UPDATE`,
        [input.accountId],
      );
      const draftId = draft.rows[0]?.id;
      if (draftId === undefined) {
        throw new PlannerConfirmationInvalidDraftError('Planner draft was not found.');
      }

      const items = await context.client.query<PlannerItemRow>(
        `SELECT id, payload
           FROM ai_planner_items
          WHERE draft_id = $1
          ORDER BY ordinal
          FOR UPDATE`,
        [draftId],
      );
      if (items.rows.length === 0) {
        throw new PlannerConfirmationInvalidDraftError(
          'Planner draft must contain at least one mission.',
        );
      }

      const occurrenceIds: string[] = [];
      let calendarDate: string | null = null;

      for (const row of items.rows) {
        const activated = await activateItem(context.client, input.accountId, row, now);
        occurrenceIds.push(activated.occurrence.id);
        calendarDate =
          calendarDate === null || activated.item.localDate < calendarDate
            ? activated.item.localDate
            : calendarDate;

        await appendAccountChange(context.client, {
          accountId: input.accountId,
          entityType: 'mission',
          entityId: activated.occurrence.id,
          operation: 'upsert',
          payload: authoritativePayload(activated.series, activated.occurrence, activated.item),
        });
        await context.enqueueOutbox({
          eventType: 'mission.activated',
          aggregateType: 'mission_occurrence',
          aggregateId: activated.occurrence.id,
        });
      }

      const removed = await context.client.query(
        'DELETE FROM ai_planner_drafts WHERE id = $1 AND account_id = $2',
        [draftId, input.accountId],
      );
      if (removed.rowCount !== 1 || calendarDate === null) {
        throw new PlannerConfirmationInvalidDraftError(
          'Planner draft could not be finalized atomically.',
        );
      }

      await appendAccountChange(context.client, {
        accountId: input.accountId,
        entityType: 'planner',
        entityId: input.accountId,
        operation: 'delete',
        payload: null,
      });

      return Object.freeze({
        missionCount: occurrenceIds.length,
        calendarDate,
        occurrenceIds: Object.freeze(occurrenceIds),
      });
    },
  });
}
