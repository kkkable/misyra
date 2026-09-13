import {
  ExternalCalendarAdapterError,
  type CalendarCommand,
  type CalendarCommandResult,
  type ExternalCalendarConnectionState,
  type ExternalCalendarInitialSyncDirection,
  type SynchronizedImportBatch,
  type SynchronizedProviderChangeBatch,
} from '@misyra/contracts';

export interface GoogleCalendarSyncConnection {
  readonly id: string;
  readonly initialSyncDirection: ExternalCalendarInitialSyncDirection;
  readonly state: ExternalCalendarConnectionState;
}

export interface PendingCalendarCommand {
  readonly occurrenceId: string;
  readonly command: CalendarCommand;
}

export interface GoogleCalendarSynchronizationProvider {
  initialImport(this: void, connectionId: string): Promise<SynchronizedImportBatch>;
  pullChanges(this: void, connectionId: string): Promise<SynchronizedProviderChangeBatch>;
  applyCommands(
    this: void,
    commands: readonly CalendarCommand[],
  ): Promise<readonly CalendarCommandResult[]>;
}

export interface GoogleCalendarSyncStore {
  getConnection(this: void, connectionId: string): Promise<GoogleCalendarSyncConnection | null>;
  reconcileFullImport(
    this: void,
    connectionId: string,
    batch: SynchronizedImportBatch,
  ): Promise<void>;
  applyProviderChanges(
    this: void,
    connectionId: string,
    batch: SynchronizedProviderChangeBatch,
  ): Promise<void>;
  listPendingCommands(this: void, connectionId: string): Promise<readonly PendingCalendarCommand[]>;
  applyCommandResults(
    this: void,
    connectionId: string,
    pending: readonly PendingCalendarCommand[],
    results: readonly CalendarCommandResult[],
  ): Promise<void>;
  clearCursor(this: void, connectionId: string): Promise<void>;
}

export interface GoogleCalendarSyncService {
  initialSync(this: void, connectionId: string): Promise<void>;
  incrementalSync(this: void, connectionId: string): Promise<void>;
}

export interface GoogleCalendarSyncServiceDependencies {
  readonly provider: GoogleCalendarSynchronizationProvider;
  readonly store: GoogleCalendarSyncStore;
}

function assertConnected(
  connection: GoogleCalendarSyncConnection | null,
): asserts connection is GoogleCalendarSyncConnection {
  if (connection === null || connection.state !== 'connected') {
    throw new ExternalCalendarAdapterError('authentication_required', 'calendar_not_connected');
  }
}

async function pushPendingCommands(
  provider: GoogleCalendarSynchronizationProvider,
  store: GoogleCalendarSyncStore,
  connectionId: string,
): Promise<void> {
  const pending = await store.listPendingCommands(connectionId);
  if (pending.length === 0) return;

  const results = await provider.applyCommands(pending.map(({ command }) => command));
  await store.applyCommandResults(connectionId, pending, results);
}

async function fullImport(
  provider: GoogleCalendarSynchronizationProvider,
  store: GoogleCalendarSyncStore,
  connectionId: string,
): Promise<void> {
  const batch = await provider.initialImport(connectionId);
  await store.reconcileFullImport(connectionId, batch);
}

export function createGoogleCalendarSyncService(
  dependencies: GoogleCalendarSyncServiceDependencies,
): GoogleCalendarSyncService {
  const { provider, store } = dependencies;

  return Object.freeze({
    async initialSync(connectionId: string): Promise<void> {
      const connection = await store.getConnection(connectionId);
      assertConnected(connection);

      if (connection.initialSyncDirection === 'misyra_to_external') {
        await pushPendingCommands(provider, store, connectionId);
      }

      await fullImport(provider, store, connectionId);
    },

    async incrementalSync(connectionId: string): Promise<void> {
      const connection = await store.getConnection(connectionId);
      assertConnected(connection);

      try {
        const batch = await provider.pullChanges(connectionId);
        await store.applyProviderChanges(connectionId, batch);
      } catch (error) {
        if (!(error instanceof ExternalCalendarAdapterError) || error.code !== 'invalid_sync_cursor') {
          throw error;
        }

        await store.clearCursor(connectionId);
        await fullImport(provider, store, connectionId);
      }

      await pushPendingCommands(provider, store, connectionId);
    },
  });
}
