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
  constructor() {
    super('Sync mutation identifier was reused with a different mutation');
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

type SettingsPatch = Readonly<{
  language?: 'en' | 'zh-HK';
  trustMode?: boolean;
}>;

type MissionSchedulePayload = Readonly<{
  localStart: string;
  localFinish: string;
  startInstant: string;
  finishInstant: string;
  timeZone: string;
  timeBehavior: 'local_time' | 'fixed_instant';
  allDay: false;
  estimatedEffortMinutes: null;
}>;

type MissionCreatePayload = Readonly<{
  series: Readonly<{
    id: string;
    title: string;
    recurrence: null;
  }>;
  occurrence: Readonly<{
    id: string;
    seriesId: string;
    schedule: MissionSchedulePayload;
    scheduleState: 'scheduled';
    completionState: 'incomplete';
    evidenceState: 'not_submitted';
    rewardEligibility: 'undetermined' | 'eligible' | 'ineligible';
    rewardIssuance: 'not_issued';
    calendarSource: 'internal';
    fieldOwnership: 'app_owned';
    synchronizationState: 'pending' | 'synced';
    storyState: 'none';
    deletionState: 'active';
  }>;
}>;

type ClientTiming = Readonly<{
  clientOccurredAt: Date;
  effectiveTime: Date;
  validationResult: 'valid' | 'invalid_replaced';
}>;

const HISTORICAL_WINDOW_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

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

  if (mutation.entityType === 'mission') {
    if (mutation.operation !== 'create' || mutation.baseVersion !== null) {
      throw new SyncMutationValidationError(
        'Mission synchronization currently supports create operations only',
      );
    }
    return;
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

function requireString(source: Record<string, unknown>, key: string, label: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SyncMutationValidationError(`${label} must be a non-empty string`);
  }
  return value;
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
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
  } catch {
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
  if (seriesSource.recurrence !== null) {
    throw new SyncMutationValidationError('MTS-044 mission create must be non-recurring');
  }

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
  if (scheduleSource.allDay !== false || scheduleSource.estimatedEffortMinutes !== null) {
    throw new SyncMutationValidationError('MTS-044 mission create must be a timed mission');
  }

  const schedule: MissionSchedulePayload = {
    localStart,
    localFinish,
    startInstant,
    finishInstant,
    timeZone: requireString(scheduleSource, 'timeZone', 'Mission time zone'),
    timeBehavior: requireLiteral(
      scheduleSource,
      'timeBehavior',
      ['local_time', 'fixed_instant'] as const,
      'Mission time behavior',
    ),
    allDay: false,
    estimatedEffortMinutes: null,
  };
  assertMissionScheduleCoherence(schedule);

  return {
    series: {
      id: seriesId,
      title: requireString(seriesSource, 'title', 'Mission title').trim(),
      recurrence: null,
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
        ['not_submitted'] as const,
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
  await client.query(
    `INSERT INTO mission_series (id, account_id, title, recurrence_rule)
     VALUES ($1, $2, $3, NULL)`,
    [mission.series.id, accountId, mission.series.title],
  );
  const schedule = mission.occurrence.schedule;
  await client.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day,
       estimated_effort_minutes, schedule_state, completion_state, evidence_state,
       reward_eligibility, reward_issuance, calendar_source, field_ownership,
       synchronization_state, story_state, deletion_state
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, FALSE,
       NULL, $11, $12, $13,
       $14, $15, $16, $17,
       'synced', $18, $19
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
      mission.occurrence.scheduleState,
      mission.occurrence.completionState,
      mission.occurrence.evidenceState,
      mission.occurrence.rewardEligibility,
      mission.occurrence.rewardIssuance,
      mission.occurrence.calendarSource,
      mission.occurrence.fieldOwnership,
      mission.occurrence.storyState,
      mission.occurrence.deletionState,
    ],
  );
  return mission;
}

async function applyExecutableMutation(
  client: PoolClient,
  mutation: StoredSyncMutation,
  timing: ClientTiming,
): Promise<unknown> {
  if (mutation.entityType === 'settings') {
    return applySettingsMutation(client, mutation.accountId, mutation.operation, mutation.payload);
  }
  if (mutation.entityType === 'mission') {
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
