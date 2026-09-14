import {
  calendarCommandSchema,
  ExternalCalendarAdapterError,
  type CalendarCommand,
  type CalendarCommandResult,
  type ExternalCalendarConnectionState,
  type ExternalCalendarInitialSyncDirection,
  type RestoreHiddenEventInput,
  type SynchronizedImportBatch,
  type SynchronizedProviderChangeBatch,
  type SynchronizedProviderEvent,
} from '@misyra/contracts';

import {
  isFutureInitialCalendarCommand,
  projectFutureOnlyInitialImport,
} from './google-calendar-initial-window.js';

export interface GoogleCalendarSyncConnection {
  readonly id: string;
  readonly initialSyncDirection: ExternalCalendarInitialSyncDirection;
  readonly state: ExternalCalendarConnectionState;
}

export interface PendingCalendarCommand {
  readonly occurrenceId: string;
  readonly command: unknown;
}

export interface GoogleCalendarSynchronizationProvider {
  initialImport(connectionId: string): Promise<SynchronizedImportBatch>;
  pullChanges(connectionId: string): Promise<SynchronizedProviderChangeBatch>;
  restoreHiddenEvent(input: RestoreHiddenEventInput): Promise<SynchronizedProviderEvent>;
  applyCommands(commands: readonly CalendarCommand[]): Promise<readonly CalendarCommandResult[]>;
}

export interface GoogleCalendarSyncStore {
  getConnection(connectionId: string): Promise<GoogleCalendarSyncConnection | null>;
  setConnectionState?(connectionId: string, state: ExternalCalendarConnectionState): Promise<void>;
  reconcileFullImport(connectionId: string, batch: SynchronizedImportBatch): Promise<void>;
  applyProviderChanges(connectionId: string, batch: SynchronizedProviderChangeBatch): Promise<void>;
  listPendingCommands(connectionId: string): Promise<readonly PendingCalendarCommand[]>;
  applyCommandResults(
    connectionId: string,
    pending: readonly PendingCalendarCommand[],
    results: readonly CalendarCommandResult[],
  ): Promise<void>;
  clearCursor(connectionId: string): Promise<void>;
}

export interface GoogleCalendarSyncService {
  initialSync(connectionId: string): Promise<void>;
  incrementalSync(connectionId: string): Promise<void>;
}

export interface GoogleCalendarSyncServiceDependencies {
  readonly provider: GoogleCalendarSynchronizationProvider;
  readonly store: GoogleCalendarSyncStore;
  readonly now?: () => Date;
}

function assertSynchronizable(
  connection: GoogleCalendarSyncConnection | null,
): asserts connection is GoogleCalendarSyncConnection {
  if (connection === null || connection.state === 'disconnected') {
    throw new ExternalCalendarAdapterError('authentication_required', 'calendar_not_connected');
  }
}

function recoveryStateForError(error: unknown): ExternalCalendarConnectionState | null {
  if (!(error instanceof ExternalCalendarAdapterError)) return null;
  if (error.code === 'provider_unavailable') return 'provider_unavailable';
  if (error.code === 'permission_denied' || error.code === 'authentication_required') {
    return 'permission_revoked';
  }
  return null;
}

async function setConnectionState(
  store: GoogleCalendarSyncStore,
  connectionId: string,
  state: ExternalCalendarConnectionState,
): Promise<void> {
  await store.setConnectionState?.(connectionId, state);
}

async function persistProviderFailure(
  store: GoogleCalendarSyncStore,
  connectionId: string,
  error: unknown,
): Promise<void> {
  const state = recoveryStateForError(error);
  if (state !== null) await setConnectionState(store, connectionId, state);
}

async function pushPendingCommands(
  provider: GoogleCalendarSynchronizationProvider,
  store: GoogleCalendarSyncStore,
  connectionId: string,
  initialMigration: boolean,
  currentTime: Date,
): Promise<void> {
  const pending = await store.listPendingCommands(connectionId);
  const parsedPending = pending.map((item) => ({
    occurrenceId: item.occurrenceId,
    command: calendarCommandSchema.parse(item.command),
  }));
  const effectivePending = initialMigration
    ? parsedPending.filter(({ command }) => isFutureInitialCalendarCommand(command, currentTime))
    : parsedPending;
  if (effectivePending.length === 0) return;

  const results = await provider.applyCommands(effectivePending.map(({ command }) => command));
  await store.applyCommandResults(connectionId, effectivePending, results);
}

async function fullImport(
  provider: GoogleCalendarSynchronizationProvider,
  store: GoogleCalendarSyncStore,
  connectionId: string,
  initialMigration: boolean,
  currentTime: Date,
): Promise<void> {
  const batch = await provider.initialImport(connectionId);
  await store.reconcileFullImport(
    connectionId,
    initialMigration ? projectFutureOnlyInitialImport(batch, currentTime) : batch,
  );
}

export function createGoogleCalendarSyncService(
  dependencies: GoogleCalendarSyncServiceDependencies,
): GoogleCalendarSyncService {
  const { provider, store } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  return Object.freeze({
    async initialSync(connectionId: string): Promise<void> {
      const connection = await store.getConnection(connectionId);
      assertSynchronizable(connection);
      const currentTime = now();

      if (connection.state !== 'connected') {
        await setConnectionState(store, connectionId, 'connected');
      }

      try {
        if (connection.initialSyncDirection === 'misyra_to_external') {
          await pushPendingCommands(provider, store, connectionId, true, currentTime);
        }

        await fullImport(provider, store, connectionId, true, currentTime);
      } catch (error) {
        await persistProviderFailure(store, connectionId, error);
        throw error;
      }
    },

    async incrementalSync(connectionId: string): Promise<void> {
      const connection = await store.getConnection(connectionId);
      assertSynchronizable(connection);

      if (connection.state !== 'connected') {
        await setConnectionState(store, connectionId, 'connected');
      }

      try {
        try {
          const batch = await provider.pullChanges(connectionId);
          await store.applyProviderChanges(connectionId, batch);
        } catch (error) {
          if (
            !(error instanceof ExternalCalendarAdapterError) ||
            error.code !== 'invalid_sync_cursor'
          ) {
            throw error;
          }

          await store.clearCursor(connectionId);
          await fullImport(provider, store, connectionId, false, now());
        }

        await pushPendingCommands(provider, store, connectionId, false, now());
      } catch (error) {
        await persistProviderFailure(store, connectionId, error);
        throw error;
      }
    },
  });
}
