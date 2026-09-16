import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { appendAccountChange } from './account-change-log.js';
import {
  SyncDeviceOwnershipError,
  SyncMutationConflictError,
  SyncMutationValidationError,
  createPostgresSyncStore,
  type PostgresSyncStore,
  type StoredSyncMutation,
  type StoredSyncPushResult,
} from './sync-store.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

type ProviderOwnership = 'app_owned' | 'organizer_controlled';
type CalendarSource = 'internal' | 'external';
type ScheduleState = 'scheduled' | 'cancelled';
type CompletionState = 'incomplete' | 'completed';
type EvidenceState = 'not_submitted' | 'pending' | 'accepted' | 'rejected' | 'not_required';
type RewardEligibility = 'undetermined' | 'eligible' | 'ineligible';
type RewardIssuance = 'not_issued' | 'issued';
type StoryState = 'none' | 'draft' | 'ready';
type DeletionState = 'active' | 'deleted';

type AppleProviderLink = Readonly<{
  connectionId: string;
  provider: 'apple';
  providerCalendarId: string;
  providerEventId: string;
  ownership: ProviderOwnership;
}>;

type EventKitSchedule = Readonly<{
  localStart: string;
  localFinish: string;
  startInstant: string;
  finishInstant: string;
  timeZone: string;
  timeBehavior: 'local_time' | 'fixed_instant';
  allDay: boolean;
  estimatedEffortMinutes: number | null;
}>;

type EventKitSeries = Readonly<{
  id: string;
  title: string;
  recurrence: Record<string, unknown> | null;
}>;

type EventKitOccurrence = Readonly<{
  id: string;
  seriesId: string;
  schedule: EventKitSchedule;
  scheduleState: 'scheduled';
  completionState: 'incomplete';
  evidenceState: 'not_submitted' | 'not_required';
  rewardEligibility: RewardEligibility;
  rewardIssuance: 'not_issued';
  calendarSource: CalendarSource;
  fieldOwnership: ProviderOwnership;
  synchronizationState: 'pending' | 'synced';
  storyState: 'none';
  deletionState: 'active';
}>;

type AuthoritativeOccurrence = Readonly<{
  id: string;
  seriesId: string;
  schedule: EventKitSchedule;
  scheduleState: ScheduleState;
  completionState: CompletionState;
  evidenceState: EvidenceState;
  rewardEligibility: RewardEligibility;
  rewardIssuance: RewardIssuance;
  calendarSource: CalendarSource;
  fieldOwnership: ProviderOwnership;
  synchronizationState: 'synced';
  storyState: StoryState;
  deletionState: DeletionState;
}>;

type EventKitMissionCreate = Readonly<{
  kind: 'create';
  series: EventKitSeries;
  occurrence: EventKitOccurrence;
  location: string | null;
  notes: string | null;
  providerLink: AppleProviderLink;
}>;

type EventKitMissionUpdate = Readonly<{
  kind: 'update';
  series: EventKitSeries;
  occurrence: EventKitOccurrence;
  location: string | null;
  notes: string | null;
  providerLink: AppleProviderLink;
}>;

type EventKitMissionMutation = EventKitMissionCreate | EventKitMissionUpdate;

interface ExistingMutationRow extends QueryResultRow {
  exactMatch: boolean;
}

interface CurrentMissionRow extends QueryResultRow {
  seriesId: string;
  title: string;
  recurrence: Record<string, unknown> | null;
  localStart: string;
  localFinish: string;
  startInstant: Date;
  finishInstant: Date;
  timeZone: string;
  timeBehavior: 'local_time' | 'fixed_instant';
  allDay: boolean;
  estimatedEffortMinutes: number | null;
  scheduleState: ScheduleState;
  completionState: CompletionState;
  evidenceState: EvidenceState;
  rewardEligibility: RewardEligibility;
  rewardIssuance: RewardIssuance;
  calendarSource: CalendarSource;
  fieldOwnership: ProviderOwnership;
  storyState: StoryState;
  deletionState: DeletionState;
  location: string | null;
  notes: string | null;
  version: number;
}

type ClientTiming = Readonly<{
  clientOccurredAt: Date;
  effectiveTime: Date;
  validationResult: 'valid' | 'invalid_replaced';
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new SyncMutationValidationError(`${label} must be an object`);
  return value;
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
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new SyncMutationValidationError(`${label} must be a string or null`);
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

function optionalRecurrence(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    throw new SyncMutationValidationError('EventKit recurrence must be an object or null');
  }
  return value;
}

function localDateTimeForInstant(instant: string, timeZone: string): string {
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
    const part = (type: Intl.DateTimeFormatPartTypes) => {
      const result = parts.find((candidate) => candidate.type === type)?.value;
      if (result === undefined) {
        throw new SyncMutationValidationError(`EventKit schedule omitted ${type}`);
      }
      return result;
    };
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
  } catch (error) {
    if (error instanceof SyncMutationValidationError) throw error;
    throw new SyncMutationValidationError('EventKit schedule time zone is invalid');
  }
}

function parseSchedule(value: unknown): EventKitSchedule {
  const source = requireRecord(value, 'EventKit schedule');
  const localStart = requireString(source, 'localStart', 'EventKit local start');
  const localFinish = requireString(source, 'localFinish', 'EventKit local finish');
  if (!LOCAL_DATE_TIME_PATTERN.test(localStart) || !LOCAL_DATE_TIME_PATTERN.test(localFinish)) {
    throw new SyncMutationValidationError(
      'EventKit local times must use ISO local date-time format',
    );
  }
  const startInstant = requireString(source, 'startInstant', 'EventKit start instant');
  const finishInstant = requireString(source, 'finishInstant', 'EventKit finish instant');
  const start = Date.parse(startInstant);
  const finish = Date.parse(finishInstant);
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish <= start) {
    throw new SyncMutationValidationError('EventKit absolute schedule is invalid');
  }
  const timeZone = requireString(source, 'timeZone', 'EventKit time zone');
  const timeBehavior = requireLiteral(
    source,
    'timeBehavior',
    ['local_time', 'fixed_instant'] as const,
    'EventKit time behavior',
  );
  if (typeof source.allDay !== 'boolean') {
    throw new SyncMutationValidationError('EventKit all-day flag must be boolean');
  }
  const allDay = source.allDay;
  const estimatedEffortMinutes = source.estimatedEffortMinutes;
  if (
    (!allDay && estimatedEffortMinutes !== null) ||
    (allDay &&
      (typeof estimatedEffortMinutes !== 'number' ||
        !Number.isSafeInteger(estimatedEffortMinutes) ||
        estimatedEffortMinutes <= 0))
  ) {
    throw new SyncMutationValidationError('EventKit estimated effort is invalid');
  }
  if (allDay && timeBehavior !== 'local_time') {
    throw new SyncMutationValidationError('EventKit all-day missions must keep local time');
  }
  if (
    localDateTimeForInstant(startInstant, timeZone) !== localStart ||
    localDateTimeForInstant(finishInstant, timeZone) !== localFinish
  ) {
    throw new SyncMutationValidationError(
      'EventKit local schedule must match its instants in the supplied time zone',
    );
  }
  return {
    localStart,
    localFinish,
    startInstant,
    finishInstant,
    timeZone,
    timeBehavior,
    allDay,
    estimatedEffortMinutes: allDay ? (estimatedEffortMinutes as number) : null,
  };
}

function parseSeries(value: unknown): EventKitSeries {
  const source = requireRecord(value, 'EventKit series');
  return {
    id: requireUuid(source, 'id', 'EventKit series id'),
    title: requireString(source, 'title', 'EventKit title').trim(),
    recurrence: optionalRecurrence(source.recurrence),
  };
}

function parseOccurrence(value: unknown, entityId: string): EventKitOccurrence {
  const source = requireRecord(value, 'EventKit occurrence');
  const id = requireUuid(source, 'id', 'EventKit occurrence id');
  if (id !== entityId) {
    throw new SyncMutationValidationError('EventKit occurrence id must match the mutation entity');
  }
  return {
    id,
    seriesId: requireUuid(source, 'seriesId', 'EventKit occurrence series id'),
    schedule: parseSchedule(source.schedule),
    scheduleState: requireLiteral(
      source,
      'scheduleState',
      ['scheduled'] as const,
      'EventKit schedule state',
    ),
    completionState: requireLiteral(
      source,
      'completionState',
      ['incomplete'] as const,
      'EventKit completion state',
    ),
    evidenceState: requireLiteral(
      source,
      'evidenceState',
      ['not_submitted', 'not_required'] as const,
      'EventKit evidence state',
    ),
    rewardEligibility: requireLiteral(
      source,
      'rewardEligibility',
      ['undetermined', 'eligible', 'ineligible'] as const,
      'EventKit reward eligibility',
    ),
    rewardIssuance: requireLiteral(
      source,
      'rewardIssuance',
      ['not_issued'] as const,
      'EventKit reward issuance',
    ),
    calendarSource: requireLiteral(
      source,
      'calendarSource',
      ['internal', 'external'] as const,
      'EventKit calendar source',
    ),
    fieldOwnership: requireLiteral(
      source,
      'fieldOwnership',
      ['app_owned', 'organizer_controlled'] as const,
      'EventKit field ownership',
    ),
    synchronizationState: requireLiteral(
      source,
      'synchronizationState',
      ['pending', 'synced'] as const,
      'EventKit synchronization state',
    ),
    storyState: requireLiteral(source, 'storyState', ['none'] as const, 'EventKit story state'),
    deletionState: requireLiteral(
      source,
      'deletionState',
      ['active'] as const,
      'EventKit deletion state',
    ),
  };
}

function parseProviderLink(value: unknown): AppleProviderLink {
  const source = requireRecord(value, 'EventKit provider link');
  if (source.provider !== 'apple') {
    throw new SyncMutationValidationError('EventKit provider link must use Apple');
  }
  return {
    connectionId: requireUuid(source, 'connectionId', 'EventKit connection id'),
    provider: 'apple',
    providerCalendarId: requireString(
      source,
      'providerCalendarId',
      'EventKit provider calendar id',
    ),
    providerEventId: requireString(source, 'providerEventId', 'EventKit provider event id'),
    ownership: requireLiteral(
      source,
      'ownership',
      ['app_owned', 'organizer_controlled'] as const,
      'EventKit provider ownership',
    ),
  };
}

function isAppleEventKitMutation(mutation: StoredSyncMutation): boolean {
  if (mutation.entityType !== 'mission' || !isRecord(mutation.payload)) return false;
  const providerLink = mutation.payload.providerLink;
  return isRecord(providerLink) && providerLink.provider === 'apple';
}

function parseAppleMutation(mutation: StoredSyncMutation): EventKitMissionMutation {
  if (mutation.operation !== 'create' && mutation.operation !== 'update') {
    throw new SyncMutationValidationError(
      'EventKit provider synchronization supports create and update mutations only',
    );
  }
  if (mutation.operation === 'create' && mutation.baseVersion !== null) {
    throw new SyncMutationValidationError('EventKit create cannot provide a base version');
  }
  if (
    mutation.operation === 'update' &&
    (mutation.baseVersion === null ||
      !Number.isSafeInteger(mutation.baseVersion) ||
      mutation.baseVersion <= 0)
  ) {
    throw new SyncMutationValidationError(
      'EventKit update requires a positive integer base version',
    );
  }
  const root = requireRecord(mutation.payload, 'EventKit mission payload');
  if (mutation.operation === 'update' && root.kind !== 'provider_details') {
    throw new SyncMutationValidationError('EventKit update must use provider_details');
  }
  const series = parseSeries(root.series);
  const occurrence = parseOccurrence(root.occurrence, mutation.entityId);
  if (occurrence.seriesId !== series.id) {
    throw new SyncMutationValidationError('EventKit occurrence must belong to the supplied series');
  }
  const providerLink = parseProviderLink(root.providerLink);
  if (providerLink.ownership !== occurrence.fieldOwnership) {
    throw new SyncMutationValidationError('EventKit ownership metadata is inconsistent');
  }
  if (
    mutation.operation === 'create' &&
    (occurrence.calendarSource !== 'external' ||
      occurrence.fieldOwnership !== 'organizer_controlled')
  ) {
    throw new SyncMutationValidationError(
      'New EventKit imports must be organizer-controlled external missions',
    );
  }
  return {
    kind: mutation.operation,
    series,
    occurrence,
    location: optionalString(root, 'location', 'EventKit location'),
    notes: optionalString(root, 'notes', 'EventKit provider notes'),
    providerLink,
  };
}

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

async function requireDeviceOwnership(
  client: PoolClient,
  accountId: string,
  deviceId: string,
): Promise<void> {
  const result = await client.query('SELECT 1 FROM devices WHERE id = $1 AND account_id = $2', [
    deviceId,
    accountId,
  ]);
  if (result.rowCount !== 1) throw new SyncDeviceOwnershipError();
}

async function existingMutationMatches(
  client: PoolClient,
  mutation: StoredSyncMutation,
  timing: ClientTiming,
): Promise<boolean | null> {
  const result = await client.query<ExistingMutationRow>(
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

async function requireAppleConnection(
  client: PoolClient,
  accountId: string,
  link: AppleProviderLink,
): Promise<void> {
  const result = await client.query(
    `SELECT 1
       FROM external_calendar_connections
      WHERE id = $1
        AND account_id = $2
        AND provider = 'apple'
        AND provider_calendar_id = $3
        AND connection_state = 'connected'
      FOR UPDATE`,
    [link.connectionId, accountId, link.providerCalendarId],
  );
  if (result.rowCount !== 1) {
    throw new SyncMutationValidationError(
      'EventKit provider link does not belong to an active Apple connection',
    );
  }
}

function authoritativePayload(input: {
  series: EventKitSeries;
  occurrence: AuthoritativeOccurrence;
  location: string | null;
  notes: string | null;
  providerLink: AppleProviderLink;
  version: number;
}) {
  return {
    version: input.version,
    series: input.series,
    occurrence: input.occurrence,
    location: input.location,
    notes: input.notes,
    providerLink: input.providerLink,
  };
}

function currentPayload(
  row: CurrentMissionRow,
  occurrenceId: string,
  providerLink: AppleProviderLink,
) {
  return authoritativePayload({
    version: row.version,
    series: {
      id: row.seriesId,
      title: row.title,
      recurrence: row.recurrence,
    },
    occurrence: {
      id: occurrenceId,
      seriesId: row.seriesId,
      schedule: {
        localStart: row.localStart,
        localFinish: row.localFinish,
        startInstant: row.startInstant.toISOString(),
        finishInstant: row.finishInstant.toISOString(),
        timeZone: row.timeZone,
        timeBehavior: row.timeBehavior,
        allDay: row.allDay,
        estimatedEffortMinutes: row.estimatedEffortMinutes,
      },
      scheduleState: row.scheduleState,
      completionState: row.completionState,
      evidenceState: row.evidenceState,
      rewardEligibility: row.rewardEligibility,
      rewardIssuance: row.rewardIssuance,
      calendarSource: row.calendarSource,
      fieldOwnership: row.fieldOwnership,
      storyState: row.storyState,
      deletionState: row.deletionState,
      synchronizationState: 'synced',
    },
    location: row.location,
    notes: row.notes,
    providerLink,
  });
}

async function readCurrentMission(
  client: PoolClient,
  accountId: string,
  occurrenceId: string,
): Promise<CurrentMissionRow> {
  const result = await client.query<CurrentMissionRow>(
    `SELECT o.series_id AS "seriesId",
            s.title,
            s.recurrence_rule AS recurrence,
            o.local_start AS "localStart",
            o.local_finish AS "localFinish",
            o.start_instant AS "startInstant",
            o.finish_instant AS "finishInstant",
            o.time_zone AS "timeZone",
            o.time_behavior AS "timeBehavior",
            o.all_day AS "allDay",
            o.estimated_effort_minutes AS "estimatedEffortMinutes",
            o.schedule_state AS "scheduleState",
            o.completion_state AS "completionState",
            o.evidence_state AS "evidenceState",
            o.reward_eligibility AS "rewardEligibility",
            o.reward_issuance AS "rewardIssuance",
            o.calendar_source AS "calendarSource",
            o.field_ownership AS "fieldOwnership",
            o.story_state AS "storyState",
            o.deletion_state AS "deletionState",
            o.location,
            o.notes,
            o.version
       FROM mission_occurrences o
       JOIN mission_series s ON s.id = o.series_id AND s.account_id = o.account_id
      WHERE o.account_id = $1 AND o.id = $2
      FOR UPDATE OF o`,
    [accountId, occurrenceId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new SyncMutationValidationError('EventKit mission target was not found');
  }
  return row;
}

async function insertOrVerifySeries(
  client: PoolClient,
  accountId: string,
  series: EventKitSeries,
): Promise<void> {
  const recurrence = series.recurrence === null ? null : JSON.stringify(series.recurrence);
  const inserted = await client.query(
    `INSERT INTO mission_series (id, account_id, title, recurrence_rule)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [series.id, accountId, series.title, recurrence],
  );
  if (inserted.rowCount === 1) return;
  const existing = await client.query<{ matches: boolean }>(
    `SELECT account_id = $2
            AND title = $3
            AND recurrence_rule IS NOT DISTINCT FROM $4::jsonb AS matches
       FROM mission_series
      WHERE id = $1`,
    [series.id, accountId, series.title, recurrence],
  );
  if (existing.rows[0]?.matches !== true) {
    throw new SyncMutationConflictError('EventKit mission series metadata does not match');
  }
}

async function persistLink(
  client: PoolClient,
  accountId: string,
  occurrenceId: string,
  link: AppleProviderLink,
): Promise<void> {
  const sameProviderEvent = await client.query<{
    id: string;
    occurrenceId: string;
  }>(
    `SELECT links.id,
            links.occurrence_id AS "occurrenceId"
       FROM external_event_links links
       JOIN external_calendar_connections connections ON connections.id = links.connection_id
      WHERE connections.account_id = $1
        AND connections.provider = 'apple'
        AND connections.provider_calendar_id = $2
        AND links.provider_event_id = $3
        AND links.recurrence_scope = 'event'
      FOR UPDATE OF links`,
    [accountId, link.providerCalendarId, link.providerEventId],
  );
  const existing = sameProviderEvent.rows[0];
  if (existing !== undefined && existing.occurrenceId !== occurrenceId) {
    throw new SyncMutationConflictError(
      'EventKit provider event is already linked to another mission',
    );
  }
  if (existing !== undefined) {
    await client.query(
      `UPDATE external_event_links
          SET connection_id = $2
        WHERE id = $1`,
      [existing.id, link.connectionId],
    );
    return;
  }
  await client.query(
    `INSERT INTO external_event_links
      (connection_id, occurrence_id, provider_event_id, recurrence_scope)
     VALUES ($1, $2, $3, 'event')`,
    [link.connectionId, occurrenceId, link.providerEventId],
  );
}

async function applyCreate(client: PoolClient, accountId: string, input: EventKitMissionCreate) {
  await requireAppleConnection(client, accountId, input.providerLink);
  await insertOrVerifySeries(client, accountId, input.series);
  const schedule = input.occurrence.schedule;
  await client.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day,
       estimated_effort_minutes, schedule_state, completion_state, evidence_state,
       reward_eligibility, reward_issuance, calendar_source, field_ownership,
       synchronization_state, story_state, deletion_state, location, notes
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12,
       'scheduled', 'incomplete', $13, $14, 'not_issued', 'external',
       'organizer_controlled', 'synced', 'none', 'active', $15, $16
     )`,
    [
      input.occurrence.id,
      accountId,
      input.series.id,
      schedule.localStart.slice(0, 10),
      schedule.localStart,
      schedule.localFinish,
      schedule.startInstant,
      schedule.finishInstant,
      schedule.timeZone,
      schedule.timeBehavior,
      schedule.allDay,
      schedule.estimatedEffortMinutes,
      input.occurrence.evidenceState,
      input.occurrence.rewardEligibility,
      input.location,
      input.notes,
    ],
  );
  await persistLink(client, accountId, input.occurrence.id, input.providerLink);
  return authoritativePayload({
    version: 1,
    series: input.series,
    occurrence: {
      ...input.occurrence,
      calendarSource: 'external',
      fieldOwnership: 'organizer_controlled',
      synchronizationState: 'synced',
    },
    location: input.location,
    notes: input.notes,
    providerLink: input.providerLink,
  });
}

async function applyUpdate(
  client: PoolClient,
  mutation: StoredSyncMutation,
  input: EventKitMissionUpdate,
  effectiveTime: Date,
) {
  if (mutation.baseVersion === null) {
    throw new SyncMutationValidationError('EventKit update requires a base version');
  }
  await requireAppleConnection(client, mutation.accountId, input.providerLink);
  const current = await readCurrentMission(client, mutation.accountId, mutation.entityId);
  if (current.deletionState !== 'active') {
    throw new SyncMutationConflictError('Mission occurrence is permanently deleted');
  }
  if (current.version !== mutation.baseVersion) {
    throw new SyncMutationConflictError(
      'Mission mutation base version does not match current occurrence version',
    );
  }
  if (
    current.seriesId !== input.series.id ||
    current.fieldOwnership !== input.providerLink.ownership ||
    current.calendarSource !== input.occurrence.calendarSource
  ) {
    throw new SyncMutationValidationError('EventKit provider metadata does not match the mission');
  }
  await persistLink(client, mutation.accountId, mutation.entityId, input.providerLink);
  if (current.completionState === 'completed') {
    return currentPayload(current, mutation.entityId, input.providerLink);
  }
  if (current.scheduleState !== 'scheduled') {
    throw new SyncMutationValidationError('Cancelled EventKit missions cannot be refreshed');
  }

  const recurrence =
    input.series.recurrence === null ? null : JSON.stringify(input.series.recurrence);
  const seriesUpdated = await client.query(
    `UPDATE mission_series
        SET title = $3,
            recurrence_rule = $4::jsonb,
            updated_at = now()
      WHERE id = $1 AND account_id = $2`,
    [input.series.id, mutation.accountId, input.series.title, recurrence],
  );
  if (seriesUpdated.rowCount !== 1) {
    throw new SyncMutationConflictError('EventKit mission series changed while it was refreshed');
  }

  const editedAfterStart = current.startInstant.getTime() <= effectiveTime.getTime();
  const movedIntoPast =
    Date.parse(input.occurrence.schedule.startInstant) < effectiveTime.getTime();
  const rewardEligibility =
    current.rewardEligibility === 'ineligible' || editedAfterStart || movedIntoPast
      ? 'ineligible'
      : current.rewardEligibility;
  const nextVersion = current.version + 1;
  const schedule = input.occurrence.schedule;
  const updated = await client.query(
    `UPDATE mission_occurrences
        SET local_date = $3,
            local_start = $4,
            local_finish = $5,
            start_instant = $6,
            finish_instant = $7,
            time_zone = $8,
            time_behavior = $9,
            all_day = $10,
            estimated_effort_minutes = $11,
            reward_eligibility = $12,
            location = $13,
            notes = $14,
            synchronization_state = 'synced',
            version = $15,
            updated_at = now()
      WHERE id = $1 AND account_id = $2 AND version = $16`,
    [
      mutation.entityId,
      mutation.accountId,
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
      input.location,
      input.notes,
      nextVersion,
      current.version,
    ],
  );
  if (updated.rowCount !== 1) {
    throw new SyncMutationConflictError(
      'Mission mutation base version does not match current occurrence version',
    );
  }

  return authoritativePayload({
    version: nextVersion,
    series: input.series,
    occurrence: {
      id: input.occurrence.id,
      seriesId: input.occurrence.seriesId,
      schedule: input.occurrence.schedule,
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
    location: input.location,
    notes: input.notes,
    providerLink: input.providerLink,
  });
}

async function acceptAppleMutation(
  client: PoolClient,
  mutation: StoredSyncMutation,
  serverReceiptTime: Date,
): Promise<void> {
  await requireDeviceOwnership(client, mutation.accountId, mutation.deviceId);
  const timing = resolveClientTiming(mutation.clientOccurredAt, serverReceiptTime);
  const existing = await existingMutationMatches(client, mutation, timing);
  if (existing === true) return;
  if (existing === false) throw new SyncMutationConflictError();

  const parsed = parseAppleMutation(mutation);
  const authoritative =
    parsed.kind === 'create'
      ? await applyCreate(client, mutation.accountId, parsed)
      : await applyUpdate(client, mutation, parsed, timing.effectiveTime);

  await client.query(
    `INSERT INTO device_sync_mutations (
       id, account_id, device_id, entity_type, entity_id, operation, base_version,
       client_occurred_at, server_receipt_time, effective_time, validation_result, payload
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
    entityType: 'mission',
    entityId: mutation.entityId,
    operation: 'upsert',
    payload: authoritative,
  });
}

export function createPostgresEventKitSyncStore(
  pool: Pool,
  now: () => Date = () => new Date(),
): PostgresSyncStore {
  const generic = createPostgresSyncStore(pool, now);
  return {
    async push(
      accountId: string,
      mutations: readonly StoredSyncMutation[],
    ): Promise<StoredSyncPushResult> {
      const acceptedMutationIds: string[] = [];
      for (const mutation of mutations) {
        if (mutation.accountId !== accountId) throw new SyncDeviceOwnershipError();
        if (!isAppleEventKitMutation(mutation)) {
          const result = await generic.push(accountId, [mutation]);
          acceptedMutationIds.push(...result.acceptedMutationIds);
          continue;
        }
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await acceptAppleMutation(client, mutation, now());
          await client.query('COMMIT');
          acceptedMutationIds.push(mutation.mutationId);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
      return { acceptedMutationIds };
    },
    pull(accountId, input) {
      return generic.pull(accountId, input);
    },
    snapshot(accountId) {
      return generic.snapshot(accountId);
    },
  };
}
