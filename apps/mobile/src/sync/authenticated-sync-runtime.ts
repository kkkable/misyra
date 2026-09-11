import { accountSettingsSchema, type AccountSettings } from '@misyra/contracts';
import {
  createMissionOccurrence,
  createMissionSeries,
  type MissionOccurrence,
  type MissionOccurrenceInput,
  type MissionSeries,
  type MissionSeriesInput,
} from '@misyra/domain';

import type { AuthSession, AuthSessionController } from '../auth/auth-session.js';
import {
  createMutationQueue,
  type MutationQueue,
  type MutationQueueDatabase,
  type SyncMutation,
} from '../storage/mutation-queue.js';
import { createAuthenticatedSyncApi, type AuthenticatedSyncApi } from './authenticated-sync-api.js';
import {
  createServerSync,
  type ServerAccountChange,
  type ServerSyncDatabase,
  type SyncConflictResult,
} from './server-sync.js';

type InstallationStore = Readonly<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}>;

type DeviceMetadata = Readonly<{
  platform: 'ios' | 'android';
  appVersion: string;
  notificationCapability: 'not_determined' | 'denied' | 'authorized' | 'unavailable';
  timeZone?: string | undefined;
}>;

type SyncDatabase = MutationQueueDatabase;

type ApiFactory = (session: AuthSession) => AuthenticatedSyncApi;

type ServerSyncRunner = (
  input: Readonly<{
    database: SyncDatabase;
    accountId: string;
    api: AuthenticatedSyncApi;
  }>,
) => Promise<Readonly<{ settledMutations: number; cursor: number }>>;

type MissionProjection = Readonly<{
  mission: Readonly<{
    series: MissionSeries;
    occurrence: MissionOccurrence;
  }>;
  location: string | null;
  notes: string | null;
  version: number;
}>;

type CachedCompletionConflictRow = Readonly<{
  payload_json: string;
  server_version: number | null;
}>;

export type AuthenticatedSyncRuntimeOptions = Readonly<{
  sessionProvider: () => Promise<AuthSession | null>;
  installationStore: InstallationStore;
  openDatabase: () => Promise<SyncDatabase>;
  apiFactory: ApiFactory;
  runServerSync?: ServerSyncRunner;
  generateInstallationId: () => string;
  deviceMetadata: () => Promise<DeviceMetadata>;
  now?: () => Date;
}>;

export type AuthenticatedSyncTimeZoneNotice = Readonly<{
  language: AccountSettings['language'];
  timeZone: string;
}>;

export type AuthenticatedSyncRunResult = Readonly<{
  accountId: string;
  deviceId: string;
  cursor: number;
  timeZoneNotice?: AuthenticatedSyncTimeZoneNotice | null;
}>;

const INSTALLATION_ID_KEY = 'misyra.installation-id.v1';
const CONFLICT_APPLICATION_HANDLER_REQUIRED =
  'Conflict outcomes require an application handler before settlement.';

export function createSyncSessionProvider(
  controller: Pick<AuthSessionController, 'restore'>,
): () => Promise<AuthSession | null> {
  return async () => {
    const state = await controller.restore();
    return state.status === 'signed_in' ? state.session : null;
  };
}

function deviceIdKey(accountId: string) {
  return `misyra.device-id.v1:${accountId}`;
}

async function readOrCreateInstallationId(
  store: InstallationStore,
  generateInstallationId: () => string,
) {
  const existing = await store.getItem(INSTALLATION_ID_KEY);
  if (existing !== null && existing.length > 0) return existing;
  const generated = generateInstallationId();
  if (generated.length === 0) throw new Error('generated_installation_id_empty');
  await store.setItem(INSTALLATION_ID_KEY, generated);
  return generated;
}

async function rememberDeviceId(store: InstallationStore, accountId: string, deviceId: string) {
  const key = deviceIdKey(accountId);
  if ((await store.getItem(key)) === deviceId) return;
  await store.setItem(key, deviceId);
}

async function applyAccountSettings(
  database: SyncDatabase,
  accountId: string,
  settings: AccountSettings,
  updatedAt: string,
) {
  if (settings.appTimeZone === undefined) {
    await database.runAsync(
      `INSERT INTO local_accounts
         (account_id, created_at, language, trust_mode, settings_updated_at)
       VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET
         language = excluded.language,
         trust_mode = excluded.trust_mode,
         settings_updated_at = excluded.settings_updated_at`,
      accountId,
      settings.language,
      settings.trustMode ? 1 : 0,
      updatedAt,
    );
    return;
  }

  await database.runAsync(
    `INSERT INTO local_accounts
       (account_id, created_at, language, trust_mode, app_time_zone, settings_updated_at)
     VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       language = excluded.language,
       trust_mode = excluded.trust_mode,
       app_time_zone = excluded.app_time_zone,
       settings_updated_at = excluded.settings_updated_at`,
    accountId,
    settings.language,
    settings.trustMode ? 1 : 0,
    settings.appTimeZone,
    updatedAt,
  );
}

function settingsFromChange(change: ServerAccountChange): AccountSettings | null {
  if (change.entityType !== 'settings') return null;
  if (change.operation !== 'upsert') {
    throw new Error('Unsupported account settings change operation.');
  }
  return accountSettingsSchema.parse(change.payload);
}

function optionalPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`Mission change ${key} must be a string or null.`);
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function missionVersion(payload: Record<string, unknown>): number {
  const value = payload.version;
  if (value === undefined) return 1;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Mission change version must be a positive integer.');
  }
  return value;
}

function missionFromChange(change: ServerAccountChange): MissionProjection | null {
  if (change.entityType !== 'mission') return null;
  if (change.operation !== 'upsert') throw new Error('Unsupported mission change operation.');
  if (
    typeof change.payload !== 'object' ||
    change.payload === null ||
    Array.isArray(change.payload)
  ) {
    throw new Error('Mission change payload must be an object.');
  }
  const payload = change.payload as Record<string, unknown>;
  if (
    typeof payload.series !== 'object' ||
    payload.series === null ||
    Array.isArray(payload.series)
  ) {
    throw new Error('Mission change series must be an object.');
  }
  if (
    typeof payload.occurrence !== 'object' ||
    payload.occurrence === null ||
    Array.isArray(payload.occurrence)
  ) {
    throw new Error('Mission change occurrence must be an object.');
  }
  const seriesInput = payload.series as MissionSeriesInput;
  const occurrenceInput = payload.occurrence as MissionOccurrenceInput;
  const series = createMissionSeries(seriesInput);
  const occurrence = createMissionOccurrence(occurrenceInput);
  if (occurrence.seriesId !== series.id) {
    throw new Error('Mission change occurrence does not belong to its series.');
  }
  const mission = Object.freeze({ series, occurrence });
  return {
    mission,
    location: optionalPayloadString(payload, 'location'),
    notes: optionalPayloadString(payload, 'notes'),
    version: missionVersion(payload),
  };
}

async function applyMissionProjection(
  transaction: ServerSyncDatabase,
  accountId: string,
  projection: MissionProjection,
  updatedAt: string,
) {
  const { mission, location, notes, version } = projection;
  const tombstone = await transaction.getFirstAsync<{ occurrence_id: string }>(
    `SELECT occurrence_id
       FROM mission_occurrence_tombstones
      WHERE account_id = ? AND occurrence_id = ?`,
    accountId,
    mission.occurrence.id,
  );
  if (tombstone !== null) return;

  const schedule = mission.occurrence.schedule;
  await transaction.runAsync(
    `INSERT INTO cached_mission_series
       (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, series_id) DO UPDATE SET
       title = excluded.title,
       timezone = excluded.timezone,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    accountId,
    mission.series.id,
    mission.series.title,
    schedule.timeZone,
    JSON.stringify(mission.series),
    updatedAt,
  );
  await transaction.runAsync(
    `INSERT INTO cached_mission_occurrences
       (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end, all_day, payload_json, server_version, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, occurrence_id) DO UPDATE SET
       series_id = excluded.series_id,
       local_date = excluded.local_date,
       scheduled_start = excluded.scheduled_start,
       scheduled_end = excluded.scheduled_end,
       all_day = excluded.all_day,
       payload_json = excluded.payload_json,
       server_version = excluded.server_version,
       updated_at = excluded.updated_at`,
    accountId,
    mission.occurrence.id,
    mission.series.id,
    schedule.localStart.slice(0, 10),
    schedule.allDay ? null : schedule.localStart.slice(11, 16),
    schedule.allDay ? null : schedule.localFinish.slice(11, 16),
    schedule.allDay ? 1 : 0,
    JSON.stringify(mission.occurrence),
    version,
    updatedAt,
  );
  await transaction.runAsync(
    `INSERT INTO search_documents
       (account_id, document_id, occurrence_id, title, location, provider_text, personal_note, general_note, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
     ON CONFLICT(account_id, document_id) DO UPDATE SET
       occurrence_id = excluded.occurrence_id,
       title = excluded.title,
       location = excluded.location,
       general_note = excluded.general_note,
       updated_at = excluded.updated_at`,
    accountId,
    mission.occurrence.id,
    mission.occurrence.id,
    mission.series.title,
    location,
    notes,
    updatedAt,
  );
}

async function applyMissionDeleteProjection(
  transaction: ServerSyncDatabase,
  accountId: string,
  occurrenceId: string,
  deletedAt: string,
) {
  const cached = await transaction.getFirstAsync<{ series_id: string }>(
    `SELECT series_id
       FROM cached_mission_occurrences
      WHERE account_id = ? AND occurrence_id = ?`,
    accountId,
    occurrenceId,
  );
  await transaction.runAsync(
    `INSERT INTO mission_occurrence_tombstones
       (account_id, occurrence_id, deleted_at, reason)
     VALUES (?, ?, ?, 'user_deleted')
     ON CONFLICT(account_id, occurrence_id) DO NOTHING`,
    accountId,
    occurrenceId,
    deletedAt,
  );
  await transaction.runAsync(
    'DELETE FROM search_documents WHERE account_id = ? AND occurrence_id = ?',
    accountId,
    occurrenceId,
  );
  await transaction.runAsync(
    'DELETE FROM cached_mission_occurrences WHERE account_id = ? AND occurrence_id = ?',
    accountId,
    occurrenceId,
  );
  if (cached !== null) {
    await transaction.runAsync(
      `DELETE FROM cached_mission_series
        WHERE account_id = ? AND series_id = ?
          AND NOT EXISTS (
            SELECT 1
              FROM cached_mission_occurrences
             WHERE account_id = ? AND series_id = ?
          )`,
      accountId,
      cached.series_id,
      accountId,
      cached.series_id,
    );
  }
}

async function applyAuthoritativeChanges(
  transaction: ServerSyncDatabase,
  accountId: string,
  changes: readonly ServerAccountChange[],
) {
  for (const change of changes) {
    const settings = settingsFromChange(change);
    if (settings !== null) {
      const settingsUpdatedAt = new Date().toISOString();
      if (settings.appTimeZone === undefined) {
        await transaction.runAsync(
          `UPDATE local_accounts
              SET language = ?,
                  trust_mode = ?,
                  settings_updated_at = ?
            WHERE account_id = ?`,
          settings.language,
          settings.trustMode ? 1 : 0,
          settingsUpdatedAt,
          accountId,
        );
      } else {
        await transaction.runAsync(
          `UPDATE local_accounts
              SET language = ?,
                  trust_mode = ?,
                  app_time_zone = ?,
                  settings_updated_at = ?
            WHERE account_id = ?`,
          settings.language,
          settings.trustMode ? 1 : 0,
          settings.appTimeZone,
          settingsUpdatedAt,
          accountId,
        );
      }
      continue;
    }
    if (change.entityType === 'mission' && change.operation === 'delete') {
      if (change.payload !== null) {
        throw new Error('Mission delete change payload must be null.');
      }
      await applyMissionDeleteProjection(
        transaction,
        accountId,
        change.entityId,
        new Date().toISOString(),
      );
      continue;
    }
    const mission = missionFromChange(change);
    if (mission !== null) {
      await applyMissionProjection(transaction, accountId, mission, new Date().toISOString());
      continue;
    }
    throw new Error(`No local sync projector is registered for ${change.entityType}.`);
  }
}

async function applyAuthoritativeSnapshot(
  transaction: ServerSyncDatabase,
  accountId: string,
  entries: readonly ServerAccountChange[],
) {
  await applyAuthoritativeChanges(transaction, accountId, entries);
}

async function pullWithRequiredPayload(
  api: AuthenticatedSyncApi,
  input: Readonly<{ cursor: number; limit: number }>,
) {
  const response = await api.pull(input);
  if (response.kind === 'snapshot_required') return response;
  return {
    ...response,
    changes: response.changes.map((change) => ({ ...change, payload: change.payload })),
  };
}

async function snapshotWithRequiredPayload(api: AuthenticatedSyncApi) {
  const response = await api.snapshot();
  return {
    ...response,
    entries: response.entries.map((entry) => ({ ...entry, payload: entry.payload })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchingNoEvidenceCompletion(
  mutation: SyncMutation | undefined,
  destinationKind: string | undefined,
  missionId: string,
): mutation is SyncMutation {
  if (mutation === undefined || destinationKind !== 'server') return false;
  const payload = mutation.payload;
  const completionMode = isRecord(payload) ? payload.completionMode : undefined;
  return (
    mutation.entityType === 'completion' &&
    mutation.operation === 'complete' &&
    mutation.entityId === missionId &&
    (completionMode === 'private' || completionMode === 'trust')
  );
}

function validServerVersion(value: number | null): boolean {
  return value === null || (Number.isSafeInteger(value) && value > 0);
}

async function reconcileRejectedCompletion(
  database: SyncDatabase,
  accountId: string,
  mutation: SyncMutation,
): Promise<void> {
  const payload = mutation.payload;
  if (!isRecord(payload) || !isRecord(payload.localBefore)) {
    throw new Error(CONFLICT_APPLICATION_HANDLER_REQUIRED);
  }
  const localBefore = payload.localBefore;
  if (localBefore.completionState !== 'incomplete') {
    throw new Error(CONFLICT_APPLICATION_HANDLER_REQUIRED);
  }
  const baseVersion = mutation.baseVersion;
  if (!validServerVersion(baseVersion)) {
    throw new Error(CONFLICT_APPLICATION_HANDLER_REQUIRED);
  }

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<CachedCompletionConflictRow>(
      `SELECT payload_json, server_version
         FROM cached_mission_occurrences
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      mutation.entityId,
    );
    if (row === null) return;
    if (!validServerVersion(row.server_version)) {
      throw new Error(CONFLICT_APPLICATION_HANDLER_REQUIRED);
    }

    if (baseVersion === null) {
      if (row.server_version !== null) return;
    } else {
      if (row.server_version === null || row.server_version < baseVersion) {
        throw new Error(CONFLICT_APPLICATION_HANDLER_REQUIRED);
      }
      if (row.server_version > baseVersion) return;
    }

    const current = createMissionOccurrence(JSON.parse(row.payload_json) as MissionOccurrenceInput);
    if (current.id !== mutation.entityId) {
      throw new Error(CONFLICT_APPLICATION_HANDLER_REQUIRED);
    }
    const restored = createMissionOccurrence({
      ...current,
      completionState: localBefore.completionState,
      evidenceState: localBefore.evidenceState,
      synchronizationState: localBefore.synchronizationState,
    } as MissionOccurrenceInput);
    const alreadyRestored =
      current.completionState === restored.completionState &&
      current.evidenceState === restored.evidenceState &&
      current.synchronizationState === restored.synchronizationState;
    if (alreadyRestored) return;
    const optimisticCompletion =
      current.completionState === 'completed' &&
      current.evidenceState === 'not_required' &&
      current.synchronizationState === 'pending';
    if (!optimisticCompletion) {
      throw new Error(CONFLICT_APPLICATION_HANDLER_REQUIRED);
    }

    const result = (await transaction.runAsync(
      `UPDATE cached_mission_occurrences
          SET payload_json = ?, updated_at = ?
        WHERE account_id = ? AND occurrence_id = ?`,
      JSON.stringify(restored),
      new Date().toISOString(),
      accountId,
      mutation.entityId,
    )) as { changes?: number };
    if (result.changes !== 1) {
      throw new Error(CONFLICT_APPLICATION_HANDLER_REQUIRED);
    }
  });
}

async function applyAuthenticatedConflicts(
  database: SyncDatabase,
  accountId: string,
  mutationQueue: MutationQueue,
  conflicts: readonly SyncConflictResult[],
): Promise<void> {
  const pendingById = new Map(
    (await mutationQueue.listPending()).map((pending) => [pending.mutation.mutationId, pending]),
  );

  for (const conflict of conflicts) {
    if (conflict.kind === 'mission_deleted') continue;

    const pending = pendingById.get(conflict.mutationId);
    const mutation = pending?.mutation;
    const missionId: unknown = conflict.missionId;
    if (typeof missionId !== 'string') {
      throw new Error(CONFLICT_APPLICATION_HANDLER_REQUIRED);
    }
    if (!matchingNoEvidenceCompletion(mutation, pending?.destination.kind, missionId)) {
      throw new Error(CONFLICT_APPLICATION_HANDLER_REQUIRED);
    }

    if (conflict.kind === 'mission_completed_elsewhere') continue;
    if (conflict.kind === 'mission_updated') {
      await reconcileRejectedCompletion(database, accountId, mutation);
      continue;
    }
    throw new Error(CONFLICT_APPLICATION_HANDLER_REQUIRED);
  }
}

export async function runAuthenticatedServerSync({
  database,
  accountId,
  api,
}: Readonly<{
  database: SyncDatabase;
  accountId: string;
  api: AuthenticatedSyncApi;
}>) {
  const mutationQueue = createMutationQueue(database, accountId);
  const sync = createServerSync({
    database,
    accountId,
    mutationQueue,
    transport: {
      push: (mutations) => api.push(mutations),
      pull: (input) => pullWithRequiredPayload(api, input),
      snapshot: () => snapshotWithRequiredPayload(api),
    },
    applyChanges: (transaction, changes) =>
      applyAuthoritativeChanges(transaction, accountId, changes),
    applySnapshot: (transaction, entries) =>
      applyAuthoritativeSnapshot(transaction, accountId, entries),
    applyConflicts: (conflicts) =>
      applyAuthenticatedConflicts(database, accountId, mutationQueue, conflicts),
  });
  return sync.run();
}

export function createAuthenticatedSyncRuntime({
  sessionProvider,
  installationStore,
  openDatabase,
  apiFactory,
  runServerSync = runAuthenticatedServerSync,
  generateInstallationId,
  deviceMetadata,
  now = () => new Date(),
}: AuthenticatedSyncRuntimeOptions) {
  let runTail: Promise<AuthenticatedSyncRunResult | null> = Promise.resolve(null);

  const execute = async (): Promise<AuthenticatedSyncRunResult | null> => {
    const session = await sessionProvider();
    if (session === null) return null;

    const installationId = await readOrCreateInstallationId(
      installationStore,
      generateInstallationId,
    );
    const metadata = await deviceMetadata();
    const observedTimeZone = metadata.timeZone;
    const api = apiFactory(session);
    const registration = await api.registerDevice({ installationId, ...metadata });
    await rememberDeviceId(installationStore, session.accountId, registration.deviceId);

    const [database, settings] = await Promise.all([openDatabase(), api.getAccountSettings()]);
    await applyAccountSettings(database, session.accountId, settings, now().toISOString());
    const result = await runServerSync({ database, accountId: session.accountId, api });
    const timeZoneNotice =
      observedTimeZone === undefined
        ? undefined
        : registration.timeZoneChanged === true
          ? {
              language: settings.language,
              timeZone: settings.appTimeZone ?? observedTimeZone,
            }
          : null;

    return {
      accountId: session.accountId,
      deviceId: registration.deviceId,
      cursor: result.cursor,
      ...(timeZoneNotice === undefined ? {} : { timeZoneNotice }),
    };
  };

  return {
    run() {
      const result = runTail.then(execute, execute);
      runTail = result;
      return result;
    },
  };
}

export function defaultAuthenticatedSyncApiFactory(baseUrl: string): ApiFactory {
  return (session) =>
    createAuthenticatedSyncApi({
      baseUrl,
      accessToken: session.accessToken,
    });
}
