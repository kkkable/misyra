import { accountSettingsSchema, type AccountSettings } from '@misyra/contracts';

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

async function applyAuthoritativeChanges(
  transaction: ServerSyncDatabase,
  accountId: string,
  changes: readonly ServerAccountChange[],
) {
  for (const change of changes) {
    const settings = settingsFromChange(change);
    if (settings === null) {
      throw new Error(`No local sync projector is registered for ${change.entityType}.`);
    }
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
  }
}

async function applyAuthoritativeSnapshot(
  transaction: ServerSyncDatabase,
  accountId: string,
  entries: readonly ServerAccountChange[],
) {
  const supported = entries.filter((entry) => entry.entityType === 'settings');
  const unsupported = entries.find((entry) => entry.entityType !== 'settings');
  if (unsupported !== undefined) {
    throw new Error(`No local snapshot projector is registered for ${unsupported.entityType}.`);
  }
  await applyAuthoritativeChanges(transaction, accountId, supported);
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
