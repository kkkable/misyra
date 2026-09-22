import type { Pool, PoolClient, QueryResultRow } from 'pg';

import {
  appendAccountChange,
  getAccountSnapshot,
  pullAccountChanges,
  type AccountChange,
} from './account-change-log.js';

export type StoredSyncMutation = Readonly<{
  mutationId: string;
  accountId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  operation: string;
  baseVersion: number | null;
  clientOccurredAt: string;
  payload: unknown;
}>;

export type StoredSyncPushResult = Readonly<{
  acceptedMutationIds: readonly string[];
}>;

export type StoredSyncPullResult =
  | Readonly<{
      kind: 'incremental';
      changes: readonly AccountChange[];
      nextCursor: number;
      hasMore: boolean;
    }>
  | Readonly<{
      kind: 'snapshot_required';
      reason: 'invalid_cursor' | 'expired_cursor';
      nextCursor: number;
    }>;

export class SyncDeviceOwnershipError extends Error {
  constructor() {
    super('Sync device does not belong to the authenticated account');
    this.name = 'SyncDeviceOwnershipError';
  }
}

export class SyncMutationConflictError extends Error {
  constructor(message = 'Sync mutation identifier was reused with a different mutation') {
    super(message);
    this.name = 'SyncMutationConflictError';
  }
}

export class SyncMutationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncMutationValidationError';
  }
}

interface MutationMatchRow extends QueryResultRow {
  exactMatch: boolean;
}

interface SettingsRow extends QueryResultRow {
  language: 'en' | 'zh-HK';
  trustMode: boolean;
}

interface MissionUpdateRow extends QueryResultRow {
  seriesId: string;
  title: string;
  recurrence: unknown;
  scheduleState: string;
  completionState: string;
  evidenceState: string;
  rewardEligibility: 'undetermined' | 'eligible' | 'ineligible';
  rewardIssuance: string;
  calendarSource: string;
  fieldOwnership: string;
  storyState: string;
  deletionState: string;
  allDay: boolean;
  startInstant: string;
  location: string | null;
  notes: string | null;
  version: number;
}

interface MissionDeleteRow extends QueryResultRow {
  calendarSource: string;
  deletionState: string;
  fieldOwnership: string;
  version: number;
}

type SettingsPatch = Readonly<{
  language?: 'en' | 'zh-HK';
  trustMode?: boolean;
}>;

type MissionPersonalNotePayload = Readonly<{
  note: string;
}>;

type MissionDeletePayload = Readonly<{
  recurrenceScope: 'this_occurrence' | 'this_and_future' | 'entire_series';
}>;

type MissionScheduleBase = Readonly<{
  localStart: string;
  localFinish: string;
  startInstant: string;
  finishInstant: string;
  timeZone: string;
  timeBehavior: 'local_time' | 'fixed_instant';
}>;

type MissionSchedulePayload =
  | (MissionScheduleBase &
      Readonly<{
        allDay: false;
        estimatedEffortMinutes: null;
      }>)
  | (MissionScheduleBase &
      Readonly<{
        allDay: true;
        estimatedEffortMinutes: number;
        timeBehavior: 'local_time';
      }>);

type MissionCreatePayload = Readonly<{
  series: Readonly<{
    id: string;
    title: string;
    recurrence: Record<string, unknown> | null;
  }>;
  occurrence: Readonly<{
    id: string;
    seriesId: string;
    schedule: MissionSchedulePayload;
    scheduleState: 'scheduled';
    completionState: 'incomplete';
    evidenceState: 'not_submitted' | 'not_required';
    rewardEligibility: 'undetermined' | 'eligible' | 'ineligible';
    rewardIssuance: 'not_issued';
    calendarSource: 'internal';
    fieldOwnership: 'app_owned';
    synchronizationState: 'pending' | 'synced';
    storyState: 'none';
    deletionState: 'active';
  }>;
  location: string | null;
  notes: string | null;
}>;

type MissionUpdateSeries = MissionCreatePayload['series'];

type MissionSourceSeriesUpdate = Readonly<{
  id: string;
  recurrence: Record<string, unknown> | null;
}>;

type MissionScopedUpdateMetadata = Readonly<{
  series?: MissionUpdateSeries | undefined;
  sourceSeries?: MissionSourceSeriesUpdate | undefined;
}>;

type MissionAdjustmentUpdatePayload = Readonly<{
  kind: 'adjustment';
  schedule: MissionSchedulePayload & Readonly<{ allDay: false; estimatedEffortMinutes: null }>;
  rewardEligibility: 'eligible' | 'ineligible';
}> &
  MissionScopedUpdateMetadata;

type MissionDetailsUpdatePayload = Readonly<{
  kind: 'details';
  title: string;
  schedule: MissionSchedulePayload;
  rewardEligibility: 'eligible' | 'ineligible';
  location: string | null;
  notes: string | null;
}> &
  MissionScopedUpdateMetadata;

type MissionUpdatePayload = MissionAdjustmentUpdatePayload | MissionDetailsUpdatePayload;

type PlannerDraftItemPayload = Readonly<{
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

type PlannerDraftPayload = Readonly<{
  text: string;
  imageAssetIds: readonly string[];
  items?: readonly PlannerDraftItemPayload[];
}>;

type ClientTiming = Readonly<{
  clientOccurredAt: Date;
  effectiveTime: Date;
  validationResult: 'valid' | 'invalid_replaced';
}>;

const HISTORICAL_WINDOW_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MAX_PLANNER_TEXT_CHARACTERS = 2_000;
const MAX_PLANNER_IMAGES = 3;

function resolveClientTiming(source: string, serverReceiptTime: Date): ClientTiming {
  const parsed = new Date(source);
  if (!Number.isFinite(parsed.getTime())) {
    return {
      clientOccurredAt: serverReceiptTime,
      effectiveTime: serverReceiptTime,
      validationResult: 'invalid_replaced',
    };
  }
  return {
    clientOccurredAt: parsed,
    effectiveTime: parsed,
    validationResult: 'valid',
  };
}

function assertExecutableMutationShape(mutation: StoredSyncMutation): void {
  if (mutation.entityType === 'planner') {
    if (mutation.entityId !== mutation.accountId) {
      throw new SyncMutationValidationError(
        'Planner mutations must target the authenticated account',
      );
    }
    if (mutation.operation !== 'update') {
      throw new SyncMutationValidationError(
        'Planner synchronization only supports update operations',
      );
    }
    if (mutation.baseVersion !== null) {
      throw new SyncMutationValidationError('Planner updates cannot provide a base version');
    }
    parsePlannerDraftPayload(mutation.payload);
    return;
  }

  if (mutation.entityType === 'settings') {
    if (mutation.entityId !== mutation.accountId) {
      throw new SyncMutationValidationError(
        'Settings mutations must target the authenticated account',
      );
    }
    if (mutation.operation !== 'update') {
      throw new SyncMutationValidationError(
        'Settings synchronization only supports update operations',
      );
    }
    return;
  }

  if (mutation.entityType === 'mission_personal_note') {
    if (mutation.operation !== 'update') {
      throw new SyncMutationValidationError(
        'Mission personal-note synchronization only supports update operations',
      );
    }
    if (mutation.baseVersion !== null) {
      throw new SyncMutationValidationError(
        'Mission personal-note update cannot provide a base version',
      );
    }
    return;
  }

  if (mutation.entityType === 'mission') {
    if (mutation.operation === 'create') {
      if (mutation.baseVersion !== null) {
        throw new SyncMutationValidationError('Mission create cannot provide a base version');
      }
      return;
    }
    if (mutation.operation === 'update') {
      if (
        mutation.baseVersion === null ||
        !Number.isSafeInteger(mutation.baseVersion) ||
        mutation.baseVersion <= 0
      ) {
        throw new SyncMutationValidationError(
          'Mission update requires a positive integer base version',
        );
      }
      return;
    }
    if (mutation.operation === 'delete') {
      if (
        mutation.baseVersion === null ||
        !Number.isSafeInteger(mutation.baseVersion) ||
        mutation.baseVersion <= 0
      ) {
        throw new SyncMutationValidationError(
          'Mission delete requires a positive integer base version',
        );
      }
      parseMissionDeletePayload(mutation.payload);
      return;
    }
    throw new SyncMutationValidationError(
      'Mission synchronization supports create, update, and delete operations only',
    );
  }

  throw new SyncMutationValidationError(
    `No executable server projector is registered for ${mutation.entityType}`,
  );
}

function changeOperation(operation: string): 'upsert' | 'delete' {
  return operation === 'delete' ? 'delete' : 'upsert';
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SyncMutationValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function plannerTimeMinute(value: string): number {
  if (!LOCAL_TIME_PATTERN.test(value)) {
    throw new SyncMutationValidationError('Planner draft time must use HH:mm format');
  }
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function parsePlannerDraftItemPayload(value: unknown): PlannerDraftItemPayload {
  const source = asRecord(value, 'Planner draft item');
  const supported = new Set([
    'id',
    'title',
    'localDate',
    'startLocalTime',
    'endLocalTime',
    'allDay',
    'estimatedMinutes',
    'timeZone',
    'location',
    'notes',
  ]);
  if (Object.keys(source).some((key) => !supported.has(key))) {
    throw new SyncMutationValidationError('Planner draft item contains unsupported fields');
  }

  const id = requireUuid(source, 'id', 'Planner draft item id');
  const title = requireString(source, 'title', 'Planner draft item title').trim();
  const localDate = requireString(source, 'localDate', 'Planner draft item date');
  if (!LOCAL_DATE_PATTERN.test(localDate)) {
    throw new SyncMutationValidationError('Planner draft item date must use YYYY-MM-DD format');
  }
  const parsedDate = new Date(`${localDate}T12:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== localDate) {
    throw new SyncMutationValidationError('Planner draft item date must be valid');
  }

  if (typeof source.allDay !== 'boolean') {
    throw new SyncMutationValidationError('Planner draft item allDay must be boolean');
  }
  if (!Number.isInteger(source.estimatedMinutes) || (source.estimatedMinutes as number) <= 0) {
    throw new SyncMutationValidationError(
      'Planner draft item estimatedMinutes must be a positive integer',
    );
  }
  const estimatedMinutes = source.estimatedMinutes as number;
  const timeZone = requireString(source, 'timeZone', 'Planner draft item time zone').trim();
  const location = optionalString(source, 'location', 'Planner draft item location');
  const notes = optionalString(source, 'notes', 'Planner draft item notes');

  if (source.allDay) {
    if (source.startLocalTime !== undefined || source.endLocalTime !== undefined) {
      throw new SyncMutationValidationError(
        'All-day Planner draft items cannot contain local times',
      );
    }
    return {
      id,
      title,
      localDate,
      allDay: true,
      estimatedMinutes,
      timeZone,
      ...(location === null ? {} : { location }),
      ...(notes === null ? {} : { notes }),
    };
  }

  const startLocalTime = requireString(source, 'startLocalTime', 'Planner draft item start time');
  const startMinute = plannerTimeMinute(startLocalTime);
  const endLocalTime =
    source.endLocalTime === undefined
      ? undefined
      : requireString(source, 'endLocalTime', 'Planner draft item end time');
  if (endLocalTime !== undefined && plannerTimeMinute(endLocalTime) <= startMinute) {
    throw new SyncMutationValidationError(
      'Timed Planner draft item must end later on the same Calendar day',
    );
  }
  if (endLocalTime === undefined && startMinute + estimatedMinutes > 24 * 60) {
    throw new SyncMutationValidationError(
      'Timed Planner draft item estimated duration must fit within one Calendar day',
    );
  }

  return {
    id,
    title,
    localDate,
    startLocalTime,
    ...(endLocalTime === undefined ? {} : { endLocalTime }),
    allDay: false,
    estimatedMinutes,
    timeZone,
    ...(location === null ? {} : { location }),
    ...(notes === null ? {} : { notes }),
  };
}

function parsePlannerDraftPayload(payload: unknown): PlannerDraftPayload {
  const source = asRecord(payload, 'Planner draft payload');
  const keys = Object.keys(source);
  const supported = new Set(['text', 'imageAssetIds', 'items']);
  if (
    keys.some((key) => !supported.has(key)) ||
    !Object.hasOwn(source, 'text') ||
    !Object.hasOwn(source, 'imageAssetIds')
  ) {
    throw new SyncMutationValidationError(
      'Planner draft payload must contain text and imageAssetIds with optional items',
    );
  }
  if (typeof source.text !== 'string') {
    throw new SyncMutationValidationError('Planner draft text must be a string');
  }
  if (Array.from(source.text).length > MAX_PLANNER_TEXT_CHARACTERS) {
    throw new SyncMutationValidationError('Planner draft text cannot exceed 2,000 characters');
  }
  if (!Array.isArray(source.imageAssetIds)) {
    throw new SyncMutationValidationError('Planner draft imageAssetIds must be an array');
  }
  if (source.imageAssetIds.length > MAX_PLANNER_IMAGES) {
    throw new SyncMutationValidationError('Planner draft can contain at most three images');
  }
  const imageAssetIds = source.imageAssetIds.map((value) => {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw new SyncMutationValidationError('Planner draft image asset ids must be UUIDs');
    }
    return value;
  });
  if (new Set(imageAssetIds).size !== imageAssetIds.length) {
    throw new SyncMutationValidationError('Planner draft image asset ids must be unique');
  }

  if (source.items === undefined) {
    return { text: source.text, imageAssetIds };
  }
  if (!Array.isArray(source.items)) {
    throw new SyncMutationValidationError('Planner draft items must be an array');
  }
  const items = source.items.map(parsePlannerDraftItemPayload);
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new SyncMutationValidationError('Planner draft item ids must be unique');
  }
  return { text: source.text, imageAssetIds, items };
}

function requireString(source: Record<string, unknown>, key: string, label: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SyncMutationValidationError(`${label} must be a non-empty string`);
  }
  return value;
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
  label: string,
): string | null {
  const value = source[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new SyncMutationValidationError(`${label} must be a string or null`);
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function optionalObject(
  source: Record<string, unknown>,
  key: string,
  label: string,
): Record<string, unknown> | null {
  const value = source[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new SyncMutationValidationError(`${label} must be an object or null`);
  }
  return value as Record<string, unknown>;
}

function requireUuid(source: Record<string, unknown>, key: string, label: string): string {
  const value = requireString(source, key, label);
  if (!UUID_PATTERN.test(value)) throw new SyncMutationValidationError(`${label} must be a UUID`);
  return value;
}

function requireLiteral<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  label: string,
): T {
  const value = source[key];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new SyncMutationValidationError(`${label} is invalid`);
  }
  return value as T;
}

function parseMissionDeletePayload(payload: unknown): MissionDeletePayload | null {
  if (payload === null) return null;
  const source = asRecord(payload, 'Mission delete payload');
  const keys = Object.keys(source);
  if (keys.length !== 1 || keys[0] !== 'recurrenceScope') {
    throw new SyncMutationValidationError(
      'Mission delete payload may contain only recurrenceScope',
    );
  }
  return {
    recurrenceScope: requireLiteral(
      source,
      'recurrenceScope',
      ['this_occurrence', 'this_and_future', 'entire_series'] as const,
      'Mission delete recurrence scope',
    ),
  };
}

function parseSettingsPatch(payload: unknown): SettingsPatch {
  const source = asRecord(payload, 'Settings mutation payload');
  const keys = Object.keys(source);
  if (keys.length === 0 || keys.some((key) => key !== 'language' && key !== 'trustMode')) {
    throw new SyncMutationValidationError('Settings mutation contains unsupported fields');
  }
  const patch: { language?: 'en' | 'zh-HK'; trustMode?: boolean } = {};
  if (Object.hasOwn(source, 'language')) {
    if (source.language !== 'en' && source.language !== 'zh-HK') {
      throw new SyncMutationValidationError('Settings language must be en or zh-HK');
    }
    patch.language = source.language;
  }
  if (Object.hasOwn(source, 'trustMode')) {
    if (typeof source.trustMode !== 'boolean') {
      throw new SyncMutationValidationError('Trust Mode must be boolean');
    }
    patch.trustMode = source.trustMode;
  }
  return patch;
}

function parseMissionPersonalNotePayload(payload: unknown): MissionPersonalNotePayload {
  const source = asRecord(payload, 'Mission personal-note payload');
  const keys = Object.keys(source);
  if (keys.length !== 1 || keys[0] !== 'note' || typeof source.note !== 'string') {
    throw new SyncMutationValidationError(
      'Mission personal-note payload must contain only a string note',
    );
  }
  return { note: source.note };
}

function requiredDateTimePart(parts: readonly Intl.DateTimeFormatPart[], type: string): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) {
    throw new SyncMutationValidationError(`Mission time zone formatting omitted ${type}`);
  }
  return value;
}

function instantAsLocalDateTime(instant: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const year = requiredDateTimePart(parts, 'year');
    const month = requiredDateTimePart(parts, 'month');
    const day = requiredDateTimePart(parts, 'day');
    const hour = requiredDateTimePart(parts, 'hour');
    const minute = requiredDateTimePart(parts, 'minute');
    const second = requiredDateTimePart(parts, 'second');
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  } catch (error) {
    if (error instanceof SyncMutationValidationError) throw error;
    throw new SyncMutationValidationError('Mission time zone is invalid');
  }
}

function assertMissionScheduleCoherence(schedule: MissionSchedulePayload): void {
  if (
    instantAsLocalDateTime(schedule.startInstant, schedule.timeZone) !== schedule.localStart ||
    instantAsLocalDateTime(schedule.finishInstant, schedule.timeZone) !== schedule.localFinish
  ) {
    throw new SyncMutationValidationError(
      'Mission local schedule must match its absolute instants in the supplied time zone',
    );
  }
}

function parseMissionSchedule(scheduleSource: Record<string, unknown>): MissionSchedulePayload {
  const localStart = requireString(scheduleSource, 'localStart', 'Mission local start');
  const localFinish = requireString(scheduleSource, 'localFinish', 'Mission local finish');
  if (!LOCAL_DATE_TIME_PATTERN.test(localStart) || !LOCAL_DATE_TIME_PATTERN.test(localFinish)) {
    throw new SyncMutationValidationError(
      'Mission local times must use ISO local date-time format',
    );
  }
  const startInstant = requireString(scheduleSource, 'startInstant', 'Mission start instant');
  const finishInstant = requireString(scheduleSource, 'finishInstant', 'Mission finish instant');
  const start = Date.parse(startInstant);
  const finish = Date.parse(finishInstant);
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish <= start) {
    throw new SyncMutationValidationError('Mission absolute schedule is invalid');
  }
  const timeZone = requireString(scheduleSource, 'timeZone', 'Mission time zone');
  const timeBehavior = requireLiteral(
    scheduleSource,
    'timeBehavior',
    ['local_time', 'fixed_instant'] as const,
    'Mission time behavior',
  );
  const allDay = scheduleSource.allDay;
  const estimatedEffortMinutes = scheduleSource.estimatedEffortMinutes;
  let schedule: MissionSchedulePayload;
  if (allDay === false) {
    if (estimatedEffortMinutes !== null) {
      throw new SyncMutationValidationError('Timed missions cannot set estimated effort minutes');
    }
    schedule = {
      localStart,
      localFinish,
      startInstant,
      finishInstant,
      timeZone,
      timeBehavior,
      allDay: false,
      estimatedEffortMinutes: null,
    };
  } else if (allDay === true) {
    if (
      timeBehavior !== 'local_time' ||
      !Number.isInteger(estimatedEffortMinutes) ||
      (estimatedEffortMinutes as number) <= 0
    ) {
      throw new SyncMutationValidationError(
        'All-day missions require local-time behavior and positive estimated effort minutes',
      );
    }
    schedule = {
      localStart,
      localFinish,
      startInstant,
      finishInstant,
      timeZone,
      timeBehavior: 'local_time',
      allDay: true,
      estimatedEffortMinutes: estimatedEffortMinutes as number,
    };
  } else {
    throw new SyncMutationValidationError('Mission all-day flag must be boolean');
  }
  assertMissionScheduleCoherence(schedule);
  return schedule;
}

function parseMissionCreatePayload(
  payload: unknown,
  expectedOccurrenceId: string,
): MissionCreatePayload {
  const root = asRecord(payload, 'Mission mutation payload');
  const seriesSource = asRecord(root.series, 'Mission series');
  const occurrenceSource = asRecord(root.occurrence, 'Mission occurrence');
  const scheduleSource = asRecord(occurrenceSource.schedule, 'Mission schedule');
  const seriesId = requireUuid(seriesSource, 'id', 'Mission series id');
  const occurrenceId = requireUuid(occurrenceSource, 'id', 'Mission occurrence id');
  const occurrenceSeriesId = requireUuid(
    occurrenceSource,
    'seriesId',
    'Mission occurrence series id',
  );
  if (occurrenceId !== expectedOccurrenceId) {
    throw new SyncMutationValidationError('Mission mutation entity id must match occurrence id');
  }
  if (occurrenceSeriesId !== seriesId) {
    throw new SyncMutationValidationError('Mission occurrence must belong to its supplied series');
  }

  const schedule = parseMissionSchedule(scheduleSource);

  return {
    series: {
      id: seriesId,
      title: requireString(seriesSource, 'title', 'Mission title').trim(),
      recurrence: optionalObject(seriesSource, 'recurrence', 'Mission recurrence'),
    },
    occurrence: {
      id: occurrenceId,
      seriesId,
      schedule,
      scheduleState: requireLiteral(
        occurrenceSource,
        'scheduleState',
        ['scheduled'] as const,
        'Mission schedule state',
      ),
      completionState: requireLiteral(
        occurrenceSource,
        'completionState',
        ['incomplete'] as const,
        'Mission completion state',
      ),
      evidenceState: requireLiteral(
        occurrenceSource,
        'evidenceState',
        ['not_submitted', 'not_required'] as const,
        'Mission evidence state',
      ),
      rewardEligibility: requireLiteral(
        occurrenceSource,
        'rewardEligibility',
        ['undetermined', 'eligible', 'ineligible'] as const,
        'Mission reward eligibility',
      ),
      rewardIssuance: requireLiteral(
        occurrenceSource,
        'rewardIssuance',
        ['not_issued'] as const,
        'Mission reward issuance',
      ),
      calendarSource: requireLiteral(
        occurrenceSource,
        'calendarSource',
        ['internal'] as const,
        'Mission calendar source',
      ),
      fieldOwnership: requireLiteral(
        occurrenceSource,
        'fieldOwnership',
        ['app_owned'] as const,
        'Mission field ownership',
      ),
      synchronizationState: 'synced',
      storyState: requireLiteral(
        occurrenceSource,
        'storyState',
        ['none'] as const,
        'Mission Story state',
      ),
      deletionState: requireLiteral(
        occurrenceSource,
        'deletionState',
        ['active'] as const,
        'Mission deletion state',
      ),
    },
    location: optionalString(root, 'location', 'Mission location'),
    notes: optionalString(root, 'notes', 'Mission notes'),
  };
}

function parseMissionUpdateSeries(value: unknown): MissionUpdateSeries {
  const source = asRecord(value, 'Mission target series');
  const keys = Object.keys(source);
  const supported = new Set(['id', 'title', 'recurrence']);
  if (keys.length !== supported.size || keys.some((key) => !supported.has(key))) {
    throw new SyncMutationValidationError('Mission target series contains unsupported fields');
  }
  return {
    id: requireUuid(source, 'id', 'Mission target series id'),
    title: requireString(source, 'title', 'Mission target series title').trim(),
    recurrence: optionalObject(source, 'recurrence', 'Mission target series recurrence'),
  };
}

function parseMissionSourceSeries(value: unknown): MissionSourceSeriesUpdate {
  const source = asRecord(value, 'Mission source series');
  const keys = Object.keys(source);
  if (keys.length !== 2 || keys.some((key) => key !== 'id' && key !== 'recurrence')) {
    throw new SyncMutationValidationError('Mission source series contains unsupported fields');
  }
  return {
    id: requireUuid(source, 'id', 'Mission source series id'),
    recurrence: optionalObject(source, 'recurrence', 'Mission source series recurrence'),
  };
}

function parseMissionScopedUpdateMetadata(
  root: Record<string, unknown>,
): MissionScopedUpdateMetadata {
  const series = Object.hasOwn(root, 'series') ? parseMissionUpdateSeries(root.series) : undefined;
  const sourceSeries = Object.hasOwn(root, 'sourceSeries')
    ? parseMissionSourceSeries(root.sourceSeries)
    : undefined;
  if (sourceSeries !== undefined && series === undefined) {
    throw new SyncMutationValidationError('Mission source series update requires a target series');
  }
  return {
    ...(series === undefined ? {} : { series }),
    ...(sourceSeries === undefined ? {} : { sourceSeries }),
  };
}

function parseMissionUpdatePayload(payload: unknown): MissionUpdatePayload {
  const root = asRecord(payload, 'Mission update payload');
  if (root.kind === 'details') {
    const keys = Object.keys(root);
    const supported = new Set([
      'kind',
      'title',
      'schedule',
      'rewardEligibility',
      'location',
      'notes',
      'series',
      'sourceSeries',
    ]);
    const required = ['kind', 'title', 'schedule', 'rewardEligibility', 'location', 'notes'];
    if (
      keys.some((key) => !supported.has(key)) ||
      required.some((key) => !Object.hasOwn(root, key))
    ) {
      throw new SyncMutationValidationError('Mission Details update contains unsupported fields');
    }
    return {
      kind: 'details',
      title: requireString(root, 'title', 'Mission title').trim(),
      schedule: parseMissionSchedule(asRecord(root.schedule, 'Mission update schedule')),
      rewardEligibility: requireLiteral(
        root,
        'rewardEligibility',
        ['eligible', 'ineligible'] as const,
        'Mission reward eligibility',
      ),
      location: optionalString(root, 'location', 'Mission location'),
      notes: optionalString(root, 'notes', 'Mission notes'),
      ...parseMissionScopedUpdateMetadata(root),
    };
  }

  const keys = Object.keys(root);
  const supported = new Set(['schedule', 'rewardEligibility', 'series', 'sourceSeries']);
  if (
    keys.some((key) => !supported.has(key)) ||
    !Object.hasOwn(root, 'schedule') ||
    !Object.hasOwn(root, 'rewardEligibility')
  ) {
    throw new SyncMutationValidationError('Mission update contains unsupported fields');
  }
  const schedule = parseMissionSchedule(asRecord(root.schedule, 'Mission update schedule'));
  if (schedule.allDay) {
    throw new SyncMutationValidationError(
      'MTS-047 direct manipulation supports timed missions only',
    );
  }
  return {
    kind: 'adjustment',
    schedule,
    rewardEligibility: requireLiteral(
      root,
      'rewardEligibility',
      ['eligible', 'ineligible'] as const,
      'Mission reward eligibility',
    ),
    ...parseMissionScopedUpdateMetadata(root),
  };
}

function enforceMissionCreatePlacement(
  mission: MissionCreatePayload,
  effectiveTime: Date,
): MissionCreatePayload {
  const start = Date.parse(mission.occurrence.schedule.startInstant);
  const ageMilliseconds = effectiveTime.getTime() - start;
  if (ageMilliseconds > HISTORICAL_WINDOW_MILLISECONDS) {
    throw new SyncMutationValidationError('Mission start exceeds the historical window');
  }
  if (ageMilliseconds <= 0 || mission.occurrence.rewardEligibility === 'ineligible') {
    return mission;
  }
  return {
    ...mission,
    occurrence: {
      ...mission.occurrence,
      rewardEligibility: 'ineligible',
    },
  };
}

async function requireDeviceOwnership(
  client: PoolClient,
  accountId: string,
  deviceId: string,
): Promise<void> {
  const result = await client.query(
    `SELECT 1
       FROM devices
      WHERE id = $1 AND account_id = $2`,
    [deviceId, accountId],
  );
  if (result.rowCount !== 1) throw new SyncDeviceOwnershipError();
}

async function existingMutationMatches(
  client: PoolClient,
  mutation: StoredSyncMutation,
  timing: ClientTiming,
): Promise<boolean | null> {
  const result = await client.query<MutationMatchRow>(
    `SELECT
       account_id = $2
       AND device_id = $3
       AND entity_type = $4
       AND entity_id = $5
       AND operation = $6
       AND base_version IS NOT DISTINCT FROM $7
       AND validation_result = $8
       AND ($8 = 'invalid_replaced' OR client_occurred_at = $9)
       AND payload = $10::jsonb AS "exactMatch"
     FROM device_sync_mutations
     WHERE id = $1
     FOR UPDATE`,
    [
      mutation.mutationId,
      mutation.accountId,
      mutation.deviceId,
      mutation.entityType,
      mutation.entityId,
      mutation.operation,
      mutation.baseVersion,
      timing.validationResult,
      timing.clientOccurredAt,
      JSON.stringify(mutation.payload),
    ],
  );
  return result.rows[0]?.exactMatch ?? null;
}

async function loadPlannerDraftItems(
  client: PoolClient,
  draftId: string,
): Promise<readonly PlannerDraftItemPayload[]> {
  const result = await client.query<{ payload: unknown }>(
    `SELECT payload
       FROM ai_planner_items
      WHERE draft_id = $1
      ORDER BY ordinal`,
    [draftId],
  );
  return result.rows.map((row) => parsePlannerDraftItemPayload(row.payload));
}

async function applyPlannerMutation(
  client: PoolClient,
  mutation: StoredSyncMutation,
  effectiveTime: Date,
): Promise<PlannerDraftPayload & Readonly<{ items: readonly PlannerDraftItemPayload[] }>> {
  const payload = parsePlannerDraftPayload(mutation.payload);
  if (payload.imageAssetIds.length > 0) {
    const media = await client.query<{ id: string }>(
      `SELECT id
         FROM media_assets
        WHERE account_id = $1
          AND id = ANY($2::uuid[])
          AND purpose = 'planner-working'
          AND deletion_state = 'active'
        FOR SHARE`,
      [mutation.accountId, payload.imageAssetIds],
    );
    if (media.rows.length !== payload.imageAssetIds.length) {
      throw new SyncMutationValidationError(
        'Planner draft images must be active planner-working assets owned by the account',
      );
    }
  }

  const result = await client.query<{
    inputText: string;
    imageAssetIds: string[];
  }>(
    `INSERT INTO ai_planner_drafts
       (id, account_id, status, input_text, image_asset_ids, updated_at)
     VALUES ($1, $1, 'draft', $2, $3::uuid[], $4)
     ON CONFLICT (account_id)
     DO UPDATE SET
       status = 'draft',
       input_text = EXCLUDED.input_text,
       image_asset_ids = EXCLUDED.image_asset_ids,
       updated_at = EXCLUDED.updated_at
     WHERE ai_planner_drafts.updated_at <= EXCLUDED.updated_at
     RETURNING input_text AS "inputText", image_asset_ids AS "imageAssetIds"`,
    [mutation.accountId, payload.text, payload.imageAssetIds, effectiveTime],
  );
  const row = result.rows[0];

  if (row !== undefined && payload.items !== undefined) {
    await client.query('DELETE FROM ai_planner_items WHERE draft_id = $1', [mutation.accountId]);
    for (const [ordinal, item] of payload.items.entries()) {
      await client.query(
        `INSERT INTO ai_planner_items (id, draft_id, ordinal, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [item.id, mutation.accountId, ordinal, JSON.stringify(item)],
      );
    }
  }

  if (row !== undefined) {
    return {
      text: row.inputText,
      imageAssetIds: row.imageAssetIds,
      items:
        payload.items === undefined
          ? await loadPlannerDraftItems(client, mutation.accountId)
          : payload.items,
    };
  }

  const current = await client.query<{
    inputText: string;
    imageAssetIds: string[];
  }>(
    `SELECT input_text AS "inputText", image_asset_ids AS "imageAssetIds"
       FROM ai_planner_drafts
      WHERE account_id = $1`,
    [mutation.accountId],
  );
  const currentRow = current.rows[0];
  if (currentRow === undefined) throw new Error('Planner sync update returned no row');
  return {
    text: currentRow.inputText,
    imageAssetIds: currentRow.imageAssetIds,
    items: await loadPlannerDraftItems(client, mutation.accountId),
  };
}

async function applySettingsMutation(
  client: PoolClient,
  accountId: string,
  operation: string,
  payload: unknown,
): Promise<SettingsRow> {
  if (operation === 'delete') {
    throw new SyncMutationValidationError('Account settings cannot be deleted');
  }
  const patch = parseSettingsPatch(payload);
  const result = await client.query<SettingsRow>(
    `INSERT INTO user_settings (account_id, language, trust_mode)
     VALUES ($1, COALESCE($2::text, 'en'), COALESCE($3::boolean, false))
     ON CONFLICT (account_id)
     DO UPDATE SET
       language = COALESCE($2::text, user_settings.language),
       trust_mode = COALESCE($3::boolean, user_settings.trust_mode),
       updated_at = now()
     RETURNING language, trust_mode AS "trustMode"`,
    [accountId, patch.language ?? null, patch.trustMode ?? null],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('Settings sync update returned no row');
  return row;
}

async function applyMissionPersonalNoteMutation(
  client: PoolClient,
  mutation: StoredSyncMutation,
): Promise<MissionPersonalNotePayload> {
  const payload = parseMissionPersonalNotePayload(mutation.payload);
  const target = await client.query<{
    calendarSource: string;
    completionState: string;
    deletionState: string;
    fieldOwnership: string;
    scheduleState: string;
  }>(
    `SELECT calendar_source AS "calendarSource",
            completion_state AS "completionState",
            deletion_state AS "deletionState",
            field_ownership AS "fieldOwnership",
            schedule_state AS "scheduleState"
       FROM mission_occurrences
      WHERE id = $1 AND account_id = $2
      FOR UPDATE`,
    [mutation.entityId, mutation.accountId],
  );
  const occurrence = target.rows[0];
  if (occurrence === undefined) {
    throw new SyncMutationValidationError('Mission personal-note target was not found');
  }
  if (
    occurrence.calendarSource !== 'external' ||
    occurrence.fieldOwnership !== 'organizer_controlled' ||
    occurrence.scheduleState !== 'scheduled' ||
    occurrence.completionState !== 'incomplete' ||
    occurrence.deletionState !== 'active'
  ) {
    throw new SyncMutationValidationError(
      'Mission personal notes require an active unfinished organizer-controlled imported mission',
    );
  }

  const saved = await client.query(
    `INSERT INTO mission_personal_notes (occurrence_id, account_id, note)
     VALUES ($1, $2, $3)
     ON CONFLICT (occurrence_id) DO UPDATE
       SET note = EXCLUDED.note,
           updated_at = now()
     WHERE mission_personal_notes.account_id = EXCLUDED.account_id`,
    [mutation.entityId, mutation.accountId, payload.note],
  );
  if (saved.rowCount !== 1) {
    throw new SyncMutationConflictError('Mission personal note changed while it was saved');
  }
  return payload;
}

async function upsertMissionSeries(
  client: PoolClient,
  accountId: string,
  series: MissionCreatePayload['series'],
): Promise<void> {
  const recurrenceJson = series.recurrence === null ? null : JSON.stringify(series.recurrence);
  const result = await client.query(
    `INSERT INTO mission_series (id, account_id, title, recurrence_rule)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title
     WHERE mission_series.account_id = EXCLUDED.account_id
       AND mission_series.title = EXCLUDED.title
       AND mission_series.recurrence_rule IS NOT DISTINCT FROM EXCLUDED.recurrence_rule
     RETURNING id`,
    [series.id, accountId, series.title, recurrenceJson],
  );
  if (result.rowCount !== 1) {
    throw new SyncMutationConflictError('Recurring mission series metadata does not match');
  }
}

async function applyMissionCreateMutation(
  client: PoolClient,
  accountId: string,
  entityId: string,
  payload: unknown,
  effectiveTime: Date,
): Promise<MissionCreatePayload> {
  const mission = enforceMissionCreatePlacement(
    parseMissionCreatePayload(payload, entityId),
    effectiveTime,
  );
  await upsertMissionSeries(client, accountId, mission.series);
  const schedule = mission.occurrence.schedule;
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
      mission.occurrence.id,
      accountId,
      mission.series.id,
      schedule.localStart.slice(0, 10),
      schedule.localStart,
      schedule.localFinish,
      schedule.startInstant,
      schedule.finishInstant,
      schedule.timeZone,
      schedule.timeBehavior,
      schedule.allDay,
      schedule.estimatedEffortMinutes,
      mission.occurrence.scheduleState,
      mission.occurrence.completionState,
      mission.occurrence.evidenceState,
      mission.occurrence.rewardEligibility,
      mission.occurrence.rewardIssuance,
      mission.occurrence.calendarSource,
      mission.occurrence.fieldOwnership,
      mission.occurrence.storyState,
      mission.occurrence.deletionState,
      mission.location,
      mission.notes,
    ],
  );
  return mission;
}

async function applyMissionUpdateMutation(
  client: PoolClient,
  mutation: StoredSyncMutation,
  effectiveTime: Date,
): Promise<unknown> {
  if (mutation.baseVersion === null) {
    throw new SyncMutationValidationError('Mission update requires a base version');
  }
  const update = parseMissionUpdatePayload(mutation.payload);
  const currentResult = await client.query<MissionUpdateRow>(
    `SELECT o.series_id AS "seriesId",
            s.title,
            s.recurrence_rule AS recurrence,
            o.schedule_state AS "scheduleState",
            o.completion_state AS "completionState",
            o.evidence_state AS "evidenceState",
            o.reward_eligibility AS "rewardEligibility",
            o.reward_issuance AS "rewardIssuance",
            o.calendar_source AS "calendarSource",
            o.field_ownership AS "fieldOwnership",
            o.story_state AS "storyState",
            o.deletion_state AS "deletionState",
            o.all_day AS "allDay",
            o.start_instant AS "startInstant",
            o.location,
            o.notes,
            o.version
       FROM mission_occurrences o
       JOIN mission_series s ON s.id = o.series_id AND s.account_id = o.account_id
      WHERE o.id = $1 AND o.account_id = $2
      FOR UPDATE OF o`,
    [mutation.entityId, mutation.accountId],
  );
  const current = currentResult.rows[0];
  if (current === undefined) {
    throw new SyncMutationValidationError('Mission update target was not found');
  }
  if (current.deletionState === 'deleted') {
    throw new SyncMutationConflictError('Mission occurrence is permanently deleted');
  }
  if (current.version !== mutation.baseVersion) {
    throw new SyncMutationConflictError(
      'Mission mutation base version does not match current occurrence version',
    );
  }
  if (
    current.scheduleState !== 'scheduled' ||
    current.completionState !== 'incomplete' ||
    current.calendarSource !== 'internal' ||
    current.fieldOwnership !== 'app_owned' ||
    current.deletionState !== 'active'
  ) {
    throw new SyncMutationValidationError(
      'Mission edits require an active unfinished app-owned mission',
    );
  }
  if (update.kind === 'adjustment' && current.allDay) {
    throw new SyncMutationValidationError(
      'Mission direct manipulation requires an active unfinished app-owned timed mission',
    );
  }
  const scoped = update.series !== undefined;
  if (update.kind === 'details' && current.recurrence !== null && !scoped) {
    throw new SyncMutationValidationError(
      'Recurring Mission Details edits require recurrence scope selection',
    );
  }
  if (update.kind === 'details' && update.schedule.allDay !== current.allDay) {
    throw new SyncMutationValidationError('Mission Details cannot change the all-day mode');
  }
  if (update.sourceSeries !== undefined && update.sourceSeries.id !== current.seriesId) {
    throw new SyncMutationValidationError('Mission source series must match the current series');
  }

  const editedAfterStart = Date.parse(current.startInstant) <= effectiveTime.getTime();
  const movedIntoPast = Date.parse(update.schedule.startInstant) < effectiveTime.getTime();
  const rewardEligibility =
    current.rewardEligibility === 'ineligible' ||
    update.rewardEligibility === 'ineligible' ||
    editedAfterStart ||
    movedIntoPast
      ? 'ineligible'
      : update.rewardEligibility;
  const nextVersion = current.version + 1;
  const schedule = update.schedule;
  const title = update.kind === 'details' ? update.title : current.title;
  const location = update.kind === 'details' ? update.location : current.location;
  const notes = update.kind === 'details' ? update.notes : current.notes;
  const targetSeries: MissionUpdateSeries = update.series ?? {
    id: current.seriesId,
    title,
    recurrence: current.recurrence as Record<string, unknown> | null,
  };
  if (update.kind === 'details' && targetSeries.title !== title) {
    throw new SyncMutationValidationError(
      'Mission target series title must match the details title',
    );
  }

  if (update.sourceSeries !== undefined) {
    const sourceUpdated = await client.query(
      `UPDATE mission_series
          SET recurrence_rule = $3::jsonb,
              updated_at = now()
        WHERE id = $1 AND account_id = $2`,
      [
        update.sourceSeries.id,
        mutation.accountId,
        update.sourceSeries.recurrence === null
          ? null
          : JSON.stringify(update.sourceSeries.recurrence),
      ],
    );
    if (sourceUpdated.rowCount !== 1) {
      throw new SyncMutationConflictError('Mission source series changed while scope was saved');
    }
  }

  if (targetSeries.id !== current.seriesId) {
    await upsertMissionSeries(client, mutation.accountId, targetSeries);
  } else if (scoped) {
    const recurrenceCheck = await client.query<{ matches: boolean }>(
      `SELECT recurrence_rule IS NOT DISTINCT FROM $3::jsonb AS matches
         FROM mission_series
        WHERE id = $1 AND account_id = $2`,
      [
        targetSeries.id,
        mutation.accountId,
        targetSeries.recurrence === null ? null : JSON.stringify(targetSeries.recurrence),
      ],
    );
    if (recurrenceCheck.rows[0]?.matches !== true) {
      throw new SyncMutationConflictError('Mission target series recurrence does not match');
    }
  }

  if (update.kind === 'details' && targetSeries.id === current.seriesId) {
    const seriesUpdated = await client.query(
      `UPDATE mission_series
          SET title = $3,
              updated_at = now()
        WHERE id = $1 AND account_id = $2`,
      [current.seriesId, mutation.accountId, title],
    );
    if (seriesUpdated.rowCount !== 1) {
      throw new SyncMutationConflictError('Mission series changed while details were saved');
    }
  }

  const updated = await client.query(
    `UPDATE mission_occurrences
        SET series_id = $3,
            local_date = $4,
            local_start = $5,
            local_finish = $6,
            start_instant = $7,
            finish_instant = $8,
            time_zone = $9,
            time_behavior = $10,
            all_day = $11,
            estimated_effort_minutes = $12,
            reward_eligibility = $13,
            location = $14,
            notes = $15,
            synchronization_state = 'synced',
            version = $16,
            updated_at = now()
      WHERE id = $1 AND account_id = $2 AND version = $17`,
    [
      mutation.entityId,
      mutation.accountId,
      targetSeries.id,
      schedule.localStart.slice(0, 10),
      schedule.localStart,
      schedule.localFinish,
      schedule.startInstant,
      schedule.finishInstant,
      schedule.timeZone,
      schedule.timeBehavior,
      schedule.allDay,
      schedule.estimatedEffortMinutes,
      rewardEligibility,
      location,
      notes,
      nextVersion,
      current.version,
    ],
  );
  if (updated.rowCount !== 1) {
    throw new SyncMutationConflictError(
      'Mission mutation base version does not match current occurrence version',
    );
  }

  return {
    version: nextVersion,
    series: targetSeries,
    occurrence: {
      id: mutation.entityId,
      seriesId: targetSeries.id,
      schedule,
      scheduleState: current.scheduleState,
      completionState: current.completionState,
      evidenceState: current.evidenceState,
      rewardEligibility,
      rewardIssuance: current.rewardIssuance,
      calendarSource: current.calendarSource,
      fieldOwnership: current.fieldOwnership,
      synchronizationState: 'synced',
      storyState: current.storyState,
      deletionState: current.deletionState,
    },
    location,
    notes,
  };
}

async function applyMissionDeleteMutation(
  client: PoolClient,
  mutation: StoredSyncMutation,
  effectiveTime: Date,
): Promise<null> {
  const deletePayload = parseMissionDeletePayload(mutation.payload);
  const currentResult = await client.query<MissionDeleteRow>(
    `SELECT calendar_source AS "calendarSource",
            deletion_state AS "deletionState",
            field_ownership AS "fieldOwnership",
            version
       FROM mission_occurrences
      WHERE id = $1 AND account_id = $2
      FOR UPDATE`,
    [mutation.entityId, mutation.accountId],
  );
  const current = currentResult.rows[0];
  if (current === undefined) {
    throw new SyncMutationValidationError('Mission delete target was not found');
  }
  if (current.deletionState === 'deleted') {
    throw new SyncMutationConflictError('Mission occurrence is permanently deleted');
  }

  if (deletePayload !== null) {
    if (
      current.calendarSource !== 'external' ||
      current.fieldOwnership !== 'organizer_controlled'
    ) {
      throw new SyncMutationValidationError(
        'Hidden dismissal scope requires an organizer-controlled imported mission',
      );
    }
    const scopedLink = await client.query(
      `UPDATE external_event_links links
          SET recurrence_scope = $3
         FROM external_calendar_connections connections
        WHERE links.occurrence_id = $1
          AND connections.id = links.connection_id
          AND connections.account_id = $2`,
      [mutation.entityId, mutation.accountId, deletePayload.recurrenceScope],
    );
    if (scopedLink.rowCount !== 1) {
      throw new SyncMutationValidationError(
        'Hidden dismissal scope requires one linked external event',
      );
    }
  }

  const nextVersion = current.version + 1;
  await client.query(
    `INSERT INTO mission_occurrence_tombstones
       (occurrence_id, account_id, deleted_at, reason)
     VALUES ($1, $2, $3, 'user_deleted')
     ON CONFLICT (occurrence_id) DO NOTHING`,
    [mutation.entityId, mutation.accountId, effectiveTime],
  );
  const updated = await client.query(
    `UPDATE mission_occurrences
        SET deletion_state = 'deleted',
            synchronization_state = 'synced',
            version = $3,
            updated_at = now()
      WHERE id = $1
        AND account_id = $2
        AND deletion_state = 'active'
        AND version = $4`,
    [mutation.entityId, mutation.accountId, nextVersion, current.version],
  );
  if (updated.rowCount !== 1) {
    throw new SyncMutationConflictError('Mission occurrence changed while deletion was applied');
  }
  return null;
}

async function applyExecutableMutation(
  client: PoolClient,
  mutation: StoredSyncMutation,
  timing: ClientTiming,
): Promise<unknown> {
  if (mutation.entityType === 'planner') {
    return applyPlannerMutation(client, mutation, timing.effectiveTime);
  }
  if (mutation.entityType === 'settings') {
    return applySettingsMutation(client, mutation.accountId, mutation.operation, mutation.payload);
  }
  if (mutation.entityType === 'mission_personal_note') {
    return applyMissionPersonalNoteMutation(client, mutation);
  }
  if (mutation.entityType === 'mission') {
    if (mutation.operation === 'update') {
      return applyMissionUpdateMutation(client, mutation, timing.effectiveTime);
    }
    if (mutation.operation === 'delete') {
      return applyMissionDeleteMutation(client, mutation, timing.effectiveTime);
    }
    return applyMissionCreateMutation(
      client,
      mutation.accountId,
      mutation.entityId,
      mutation.payload,
      timing.effectiveTime,
    );
  }
  throw new SyncMutationValidationError(
    `No executable server projector is registered for ${mutation.entityType}`,
  );
}

async function acceptMutation(
  client: PoolClient,
  mutation: StoredSyncMutation,
  serverReceiptTime: Date,
): Promise<void> {
  assertExecutableMutationShape(mutation);
  await requireDeviceOwnership(client, mutation.accountId, mutation.deviceId);
  const timing = resolveClientTiming(mutation.clientOccurredAt, serverReceiptTime);

  const existingMatch = await existingMutationMatches(client, mutation, timing);
  if (existingMatch === true) return;
  if (existingMatch === false) throw new SyncMutationConflictError();

  const authoritativePayload = await applyExecutableMutation(client, mutation, timing);

  await client.query(
    `INSERT INTO device_sync_mutations (
       id,
       account_id,
       device_id,
       entity_type,
       entity_id,
       operation,
       base_version,
       client_occurred_at,
       server_receipt_time,
       effective_time,
       validation_result,
       payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
    [
      mutation.mutationId,
      mutation.accountId,
      mutation.deviceId,
      mutation.entityType,
      mutation.entityId,
      mutation.operation,
      mutation.baseVersion,
      timing.clientOccurredAt,
      serverReceiptTime,
      timing.effectiveTime,
      timing.validationResult,
      JSON.stringify(mutation.payload),
    ],
  );

  await appendAccountChange(client, {
    accountId: mutation.accountId,
    entityType: mutation.entityType,
    entityId: mutation.entityId,
    operation: changeOperation(mutation.operation),
    payload: authoritativePayload,
  });
}

export function createPostgresSyncStore(pool: Pool, now: () => Date = () => new Date()) {
  return {
    async push(
      accountId: string,
      mutations: readonly StoredSyncMutation[],
    ): Promise<StoredSyncPushResult> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const acceptedMutationIds: string[] = [];
        for (const mutation of mutations) {
          if (mutation.accountId !== accountId) throw new SyncDeviceOwnershipError();
          await acceptMutation(client, mutation, now());
          acceptedMutationIds.push(mutation.mutationId);
        }
        await client.query('COMMIT');
        return { acceptedMutationIds };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async pull(
      accountId: string,
      input: Readonly<{ cursor: number; limit: number }>,
    ): Promise<StoredSyncPullResult> {
      const page = await pullAccountChanges(pool, {
        accountId,
        cursor: input.cursor,
        limit: input.limit + 1,
      });
      if (page.kind === 'snapshot_required') return page;

      const hasMore = page.changes.length > input.limit;
      const changes = hasMore ? page.changes.slice(0, input.limit) : page.changes;
      return {
        kind: 'incremental',
        changes,
        nextCursor: changes.at(-1)?.sequence ?? input.cursor,
        hasMore,
      };
    },

    snapshot(accountId: string) {
      return getAccountSnapshot(pool, accountId);
    },
  };
}

export type PostgresSyncStore = ReturnType<typeof createPostgresSyncStore>;
