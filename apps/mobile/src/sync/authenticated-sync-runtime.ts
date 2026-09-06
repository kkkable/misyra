import { accountSettingsSchema, type AccountSettings } from '@misyra/contracts';
import {
  createOneTimeMission,
  type MissionOccurrenceInput,
  type MissionSeriesInput,
  type OneTimeMission,
} from '@misyra/domain';

import { createAuthenticatedSyncApi, type AuthenticatedSyncApi } from './authenticated-sync-api.js';
import {
  createServerSync,
  type ServerAccountChange,
  type ServerSyncDatabase,
} from './server-sync.js';
import type { AuthSession, AuthSessionController } from '../auth/auth-session.js';
import { createMutationQueue, type MutationQueueDatabase } from '../storage/mutation-queue.js';

type InstallationStore = Readonly<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}>;

type DeviceMetadata = Readonly<{
  platform: 'ios' | 'android';
  appVersion: string;
  notificationCapability: 'not_determined' | 'denied' | 'authorized' | 'unavailable';
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

const INSTALLATION_ID_KEY = 'misyra.installation-id.v1';

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
}

function settingsFromChange(change: ServerAccountChange): AccountSettings | null {
  if (change.entityType !== 'settings') return null;
  if (change.operation !== 'upsert') {
    throw new Error('Unsupported account settings change operation.');
  }
  return accountSettingsSchema.parse(change.payload);
}

function missionFromChange(change: ServerAccountChange): OneTimeMission | null {
  if (change.entityType !== 'mission') return null;
  if (change.operation !== 'upsert') throw new Error('Unsupported mission change operation.');
  if (typeof change.payload !== 'object' || change.payload === null || Array.isArray(change.payload)) {
    throw new Error('Mission change payload must be an object.');
  }
  const payload = change.payload as Record<string, unknown>;
  if (typeof payload.series !== 'object' || payload.series === null || Array.isArray(payload.series)) {
    throw new Error('Mission change series must be an object.');
  }
  if (
    typeof payload.occurrence !== 'object' ||
    payload.occurrence === null ||
    Array.isArray(payload.occurrence)
  ) {
    throw new Error('Mission change occurrence must be an object.');
  }
  const series = payload.series as MissionSeriesInput;
  const occurrence = payload.occurrence as MissionOccurrenceInput;
  return createOneTimeMission({
    series: { id: series.id, title: series.title },
    occurrence: {
      id: occurrence.id,
      schedule: occurrence.schedule,
      scheduleState: occurrence.scheduleState,
      completionState: occurrence.completionState,
      evidenceState: occurrence.evidenceState,
      rewardEligibility: occurrence.rewardEligibility,
      rewardIssuance: occurrence.rewardIssuance,
      calendarSource: occurrence.calendarSource,
      fieldOwnership: occurrence.fieldOwnership,
      synchronizationState: occurrence.synchronizationState,
      storyState: occurrence.storyState,
      deletionState: occurrence.deletionState,
    },
  });
}

async function applyMissionProjection(
  transaction: ServerSyncDatabase,
  accountId: string,
  mission: OneTimeMission,
  updatedAt: string,
) {
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
       (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end, all_day, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, occurrence_id) DO UPDATE SET
       series_id = excluded.series_id,
       local_date = excluded.local_date,
       scheduled_start = excluded.scheduled_start,
       scheduled_end = excluded.scheduled_end,
       all_day = excluded.all_day,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    accountId,
    mission.occurrence.id,
    mission.series.id,
    schedule.localStart.slice(0, 10),
    schedule.allDay ? null : schedule.localStart.slice(11, 16),
    schedule.allDay ? null : schedule.localFinish.slice(11, 16),
    schedule.allDay ? 1 : 0,
    JSON.stringify(mission.occurrence),
    updatedAt,
  );
  await transaction.runAsync(
    `INSERT INTO search_documents
       (account_id, document_id, occurrence_id, title, location, provider_text, personal_note, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)
     ON CONFLICT(account_id, document_id) DO UPDATE SET
       occurrence_id = excluded.occurrence_id,
       title = excluded.title,
       updated_at = excluded.updated_at`,
    accountId,
    mission.occurrence.id,
    mission.occurrence.id,
    mission.series.title,
    updatedAt,
  );
}

async function applyAuthoritativeChanges(
  transaction: ServerSyncDatabase,
  accountId: string,
  changes: readonly ServerAccountChange[],
) {
  for (const change of changes) {
    const settings = settingsFromChange(change);
    if (settings !== null) {
      await transaction.runAsync(
        `UPDATE local_accounts
            SET language = ?,
                trust_mode = ?,
                settings_updated_at = ?
          WHERE account_id = ?`,
        settings.language,
        settings.trustMode ? 1 : 0,
        new Date().toISOString(),
        accountId,
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
  let runTail: Promise<Readonly<{ accountId: string; deviceId: string; cursor: number }> | null> =
    Promise.resolve(null);

  const execute = async () => {
    const session = await sessionProvider();
    if (session === null) return null;

    const installationId = await readOrCreateInstallationId(
      installationStore,
      generateInstallationId,
    );
    const metadata = await deviceMetadata();
    const api = apiFactory(session);
    const registration = await api.registerDevice({ installationId, ...metadata });
    await rememberDeviceId(installationStore, session.accountId, registration.deviceId);

    const [database, settings] = await Promise.all([openDatabase(), api.getAccountSettings()]);
    await applyAccountSettings(database, session.accountId, settings, now().toISOString());
    const result = await runServerSync({ database, accountId: session.accountId, api });
    return {
      accountId: session.accountId,
      deviceId: registration.deviceId,
      cursor: result.cursor,
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
