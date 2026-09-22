import type { AllDayMissionSummary } from '../calendar/calendar-all-day.js';
import type { CalendarMissionCreateInput } from '../calendar/calendar-mission-create.js';
import type { MissionAdjustmentSave } from '../calendar/calendar-mission-adjustment.js';
import type { TimedMissionSummary } from '../calendar/calendar-mission-layout.js';
import {
  publishLocalMutationApplied,
  type MutationQueueDatabase,
  type SyncMutation,
} from '../storage/mutation-queue.js';
import { createAiPlannerDraftInput } from './ai-planner-input.js';

export type PlannerCalendarDraftItem = Readonly<{
  id: string;
  title: string;
  localDate: string;
  startLocalTime?: string;
  endLocalTime?: string;
  allDay: boolean;
  estimatedMinutes: number;
  timeZone: string;
  location?: string;
  notes?: string;
}>;

export type PlannerCalendarDraftDocument = Readonly<{
  text: string;
  imageAssetIds: readonly string[];
  items: readonly PlannerCalendarDraftItem[];
}>;

export type PlannerDraftCalendarMaps = Readonly<{
  allDay: Readonly<Record<string, readonly AllDayMissionSummary[]>>;
  timed: Readonly<Record<string, readonly TimedMissionSummary[]>>;
}>;

type PlannerDraftRow = Readonly<{
  content_json: string;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_PER_DAY = 24 * 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(
  source: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalText(
  source: Record<string, unknown>,
  key: string,
  label: string,
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string.`);
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function assertLocalDate(value: string): void {
  if (!LOCAL_DATE_PATTERN.test(value))
    throw new TypeError('Draft date must use YYYY-MM-DD format.');
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError('Draft date must be valid.');
  }
}

function timeToMinute(value: string): number {
  if (!LOCAL_TIME_PATTERN.test(value)) throw new TypeError('Draft time must use HH:mm format.');
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function minuteToTime(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= MINUTES_PER_DAY) {
    throw new RangeError('Draft minute must fit within one Calendar day.');
  }
  const hour = String(Math.floor(value / 60)).padStart(2, '0');
  const minute = String(value % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

function parseDraftItem(source: unknown): PlannerCalendarDraftItem {
  if (!isRecord(source)) throw new TypeError('Planner draft item must be an object.');
  const id = requireNonEmptyString(source, 'id', 'Planner draft item id');
  if (!UUID_PATTERN.test(id)) throw new TypeError('Planner draft item id must be a UUID.');
  const title = requireNonEmptyString(source, 'title', 'Planner draft item title');
  const localDate = requireNonEmptyString(source, 'localDate', 'Planner draft item date');
  assertLocalDate(localDate);
  const timeZone = requireNonEmptyString(source, 'timeZone', 'Planner draft item time zone');
  if (typeof source.allDay !== 'boolean') {
    throw new TypeError('Planner draft item allDay must be boolean.');
  }
  if (!Number.isInteger(source.estimatedMinutes) || (source.estimatedMinutes as number) <= 0) {
    throw new RangeError('Planner draft item estimatedMinutes must be a positive integer.');
  }
  const estimatedMinutes = source.estimatedMinutes as number;
  const location = optionalText(source, 'location', 'Planner draft item location');
  const notes = optionalText(source, 'notes', 'Planner draft item notes');

  if (source.allDay) {
    if (source.startLocalTime !== undefined || source.endLocalTime !== undefined) {
      throw new TypeError('All-day Planner draft items cannot contain local times.');
    }
    return Object.freeze({
      id,
      title,
      localDate,
      allDay: true,
      estimatedMinutes,
      timeZone,
      ...(location === undefined ? {} : { location }),
      ...(notes === undefined ? {} : { notes }),
    });
  }

  const startLocalTime = requireNonEmptyString(
    source,
    'startLocalTime',
    'Planner draft item start time',
  );
  const startMinute = timeToMinute(startLocalTime);
  const rawEnd = optionalText(source, 'endLocalTime', 'Planner draft item end time');
  const endMinute = rawEnd === undefined ? startMinute + estimatedMinutes : timeToMinute(rawEnd);
  if (endMinute <= startMinute || endMinute > MINUTES_PER_DAY) {
    throw new RangeError('Timed Planner draft item must end later on the same Calendar day.');
  }
  const endLocalTime = rawEnd ?? minuteToTime(endMinute);

  return Object.freeze({
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
  });
}

export function parsePlannerCalendarDraftDocument(source: unknown): PlannerCalendarDraftDocument {
  if (!isRecord(source)) throw new TypeError('Planner Calendar draft must be an object.');
  if (typeof source.text !== 'string' || !Array.isArray(source.imageAssetIds)) {
    throw new TypeError('Planner Calendar draft input is invalid.');
  }
  const input = createAiPlannerDraftInput({
    text: source.text,
    imageAssetIds: source.imageAssetIds.map((value) => {
      if (typeof value !== 'string')
        throw new TypeError('Planner draft image ids must be strings.');
      return value;
    }),
  });
  const rawItems = source.items ?? [];
  if (!Array.isArray(rawItems))
    throw new TypeError('Planner Calendar draft items must be an array.');
  const items = rawItems.map(parseDraftItem);
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new TypeError('Planner Calendar draft item ids must be unique.');
  }
  return Object.freeze({
    text: input.text,
    imageAssetIds: input.imageAssetIds,
    items: Object.freeze(items),
  });
}

export function plannerDraftCalendarMaps(
  document: PlannerCalendarDraftDocument,
): PlannerDraftCalendarMaps {
  const parsed = parsePlannerCalendarDraftDocument(document);
  const allDay: Record<string, AllDayMissionSummary[]> = {};
  const timed: Record<string, TimedMissionSummary[]> = {};

  for (const item of parsed.items) {
    if (item.allDay) {
      const dayItems = allDay[item.localDate] ?? [];
      dayItems.push({
        id: item.id,
        title: item.title,
        orderKey: item.id,
        completed: false,
        status: 'unfinished',
        previewKind: 'planner_draft',
      });
      allDay[item.localDate] = dayItems;
      continue;
    }

    const startMinute = timeToMinute(item.startLocalTime as string);
    const endMinute = timeToMinute(item.endLocalTime as string);
    const timedItems = timed[item.localDate] ?? [];
    timedItems.push({
      id: item.id,
      title: item.title,
      startMinute,
      endMinute,
      orderKey: item.id,
      status: 'unfinished',
      rewardEligibility: 'ineligible',
      timeZone: item.timeZone,
      previewKind: 'planner_draft',
    });
    timed[item.localDate] = timedItems;
  }

  return Object.freeze({ allDay, timed });
}

export function plannerDraftItemInput(
  item: PlannerCalendarDraftItem,
): CalendarMissionCreateInput {
  const parsed = parseDraftItem(item);
  if (parsed.allDay) {
    return Object.freeze({
      selectedDate: parsed.localDate,
      title: parsed.title,
      allDay: true,
      startMinute: null,
      endMinute: null,
      estimatedEffortMinutes: parsed.estimatedMinutes,
      rewardEligibility: 'ineligible',
      timeZone: parsed.timeZone,
      timeBehavior: 'local_time',
      recurrence: null,
      private: false,
      location: parsed.location ?? null,
      notes: parsed.notes ?? null,
    });
  }

  return Object.freeze({
    selectedDate: parsed.localDate,
    title: parsed.title,
    allDay: false,
    startMinute: timeToMinute(parsed.startLocalTime as string),
    endMinute: timeToMinute(parsed.endLocalTime as string),
    estimatedEffortMinutes: null,
    rewardEligibility: 'ineligible',
    timeZone: parsed.timeZone,
    timeBehavior: 'local_time',
    recurrence: null,
    private: false,
    location: parsed.location ?? null,
    notes: parsed.notes ?? null,
  });
}

function draftItemFromInput(
  id: string,
  input: CalendarMissionCreateInput,
): PlannerCalendarDraftItem {
  const title = input.title.trim();
  if (title.length === 0) throw new TypeError('Planner draft item title must not be empty.');
  assertLocalDate(input.selectedDate);
  const timeZone = input.timeZone.trim();
  if (timeZone.length === 0) throw new TypeError('Planner draft item time zone must not be empty.');
  const location = input.location?.trim() || undefined;
  const notes = input.notes?.trim() || undefined;

  if (input.allDay === true) {
    const estimatedMinutes = input.estimatedEffortMinutes;
    if (!Number.isInteger(estimatedMinutes) || (estimatedMinutes as number) <= 0) {
      throw new RangeError(
        'All-day Planner draft items require positive estimated effort minutes.',
      );
    }
    return Object.freeze({
      id,
      title,
      localDate: input.selectedDate,
      allDay: true,
      estimatedMinutes: estimatedMinutes as number,
      timeZone,
      ...(location === undefined ? {} : { location }),
      ...(notes === undefined ? {} : { notes }),
    });
  }

  if (
    !Number.isInteger(input.startMinute) ||
    !Number.isInteger(input.endMinute) ||
    (input.startMinute as number) < 0 ||
    (input.endMinute as number) > MINUTES_PER_DAY ||
    (input.endMinute as number) <= (input.startMinute as number)
  ) {
    throw new RangeError('Timed Planner draft items require a valid same-day interval.');
  }
  const startMinute = input.startMinute as number;
  const endMinute = input.endMinute as number;
  return Object.freeze({
    id,
    title,
    localDate: input.selectedDate,
    startLocalTime: minuteToTime(startMinute),
    endLocalTime: minuteToTime(endMinute),
    allDay: false,
    estimatedMinutes: endMinute - startMinute,
    timeZone,
    ...(location === undefined ? {} : { location }),
    ...(notes === undefined ? {} : { notes }),
  });
}

export function createPlannerCalendarDraftStore(
  options: Readonly<{
    database: MutationQueueDatabase;
    accountId: string;
    deviceId: string;
    generateMutationId: () => string;
    generateItemId: () => string;
    now: () => Date;
  }>,
) {
  const load = async (): Promise<PlannerCalendarDraftDocument | null> => {
    const row = await options.database.getFirstAsync<PlannerDraftRow>(
      'SELECT content_json FROM planner_drafts WHERE account_id = ?',
      options.accountId,
    );
    if (row === null) return null;
    return parsePlannerCalendarDraftDocument(JSON.parse(row.content_json) as unknown);
  };

  const persist = async (
    document: PlannerCalendarDraftDocument,
  ): Promise<PlannerCalendarDraftDocument> => {
    const validated = parsePlannerCalendarDraftDocument(document);
    const mutationId = options.generateMutationId();
    const updatedAt = options.now().toISOString();
    let persisted: PlannerCalendarDraftDocument | null = null;

    await options.database.withExclusiveTransactionAsync(async (transaction) => {
      const currentRow = await transaction.getFirstAsync<PlannerDraftRow>(
        'SELECT content_json FROM planner_drafts WHERE account_id = ?',
        options.accountId,
      );
      const currentDocument =
        currentRow === null
          ? null
          : parsePlannerCalendarDraftDocument(JSON.parse(currentRow.content_json) as unknown);
      const payload =
        currentDocument === null
          ? validated
          : Object.freeze({
              text: currentDocument.text,
              imageAssetIds: currentDocument.imageAssetIds,
              items: validated.items,
            });
      const mutation: SyncMutation<PlannerCalendarDraftDocument> = {
        mutationId,
        accountId: options.accountId,
        deviceId: options.deviceId,
        entityType: 'planner',
        entityId: options.accountId,
        operation: 'update',
        baseVersion: null,
        clientOccurredAt: updatedAt,
        payload,
      };
      const envelope = JSON.stringify({ mutation, destination: { kind: 'server' as const } });

      await transaction.runAsync(
        `INSERT INTO planner_drafts (account_id, draft_id, content_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           draft_id = excluded.draft_id,
           content_json = excluded.content_json,
           updated_at = excluded.updated_at`,
        options.accountId,
        options.accountId,
        JSON.stringify(payload),
        updatedAt,
      );
      await transaction.runAsync(
        `DELETE FROM mutation_queue
          WHERE account_id = ?
            AND json_extract(command_json, '$.mutation.entityType') = 'planner'`,
        options.accountId,
      );
      const sequenceRow = await transaction.getFirstAsync<{ next_sequence: number }>(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
           FROM mutation_queue
          WHERE account_id = ?`,
        options.accountId,
      );
      const sequence = sequenceRow?.next_sequence ?? 1;
      if (!Number.isSafeInteger(sequence) || sequence <= 0) {
        throw new Error('Planner mutation queue sequence is invalid.');
      }
      await transaction.runAsync(
        `INSERT INTO mutation_queue
          (account_id, mutation_id, sequence, command_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        options.accountId,
        mutationId,
        sequence,
        envelope,
        updatedAt,
      );
      persisted = payload;
    });
    if (persisted === null) throw new Error('Planner Calendar draft persistence did not complete.');
    publishLocalMutationApplied({ entityType: 'planner' });
    return persisted;
  };

  const requireDraft = async (): Promise<PlannerCalendarDraftDocument> => {
    const document = await load();
    if (document === null) throw new Error('Planner Calendar draft does not exist.');
    return document;
  };

  return Object.freeze({
    load,
    async add(input: CalendarMissionCreateInput): Promise<PlannerCalendarDraftDocument> {
      const document =
        (await load()) ??
        Object.freeze({
          text: '',
          imageAssetIds: Object.freeze([]),
          items: Object.freeze([]),
        });
      const item = draftItemFromInput(options.generateItemId(), input);
      return persist({ ...document, items: [...document.items, item] });
    },
    async update(
      itemId: string,
      input: CalendarMissionCreateInput,
    ): Promise<PlannerCalendarDraftDocument> {
      const document = await requireDraft();
      const index = document.items.findIndex((item) => item.id === itemId);
      if (index < 0) throw new Error('Planner Calendar draft item was not found.');
      const replacement = draftItemFromInput(itemId, input);
      const items = [...document.items];
      items[index] = replacement;
      return persist({ ...document, items });
    },
    async adjust(adjustment: MissionAdjustmentSave): Promise<PlannerCalendarDraftDocument> {
      const document = await requireDraft();
      const index = document.items.findIndex((item) => item.id === adjustment.missionId);
      if (index < 0) throw new Error('Planner Calendar draft item was not found.');
      const item = document.items[index];
      if (item.allDay) throw new Error('All-day Planner draft items cannot use timed gestures.');
      if (
        !Number.isInteger(adjustment.startMinute) ||
        !Number.isInteger(adjustment.endMinute) ||
        adjustment.startMinute < 0 ||
        adjustment.endMinute > MINUTES_PER_DAY ||
        adjustment.endMinute <= adjustment.startMinute
      ) {
        throw new RangeError('Planner Calendar draft adjustment must fit within one day.');
      }
      const items = [...document.items];
      items[index] = Object.freeze({
        ...item,
        startLocalTime: minuteToTime(adjustment.startMinute),
        endLocalTime: minuteToTime(adjustment.endMinute),
        estimatedMinutes: adjustment.endMinute - adjustment.startMinute,
      });
      return persist({ ...document, items });
    },
    async remove(itemId: string): Promise<PlannerCalendarDraftDocument> {
      const document = await requireDraft();
      if (!document.items.some((item) => item.id === itemId)) {
        throw new Error('Planner Calendar draft item was not found.');
      }
      return persist({
        ...document,
        items: document.items.filter((item) => item.id !== itemId),
      });
    },
  });
}
