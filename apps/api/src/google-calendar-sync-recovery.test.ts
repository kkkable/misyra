import { describe, expect, it, vi } from 'vitest';

import {
  ExternalCalendarAdapterError,
  type CalendarCommand,
  type CalendarCommandResult,
  type ExternalCalendarConnectionState,
  type SynchronizedImportBatch,
  type SynchronizedProviderChangeBatch,
} from '@misyra/contracts';

import {
  createGoogleCalendarSyncService,
  type GoogleCalendarSynchronizationProvider,
  type GoogleCalendarSyncStore,
} from './google-calendar-sync.js';

const connectionId = '11111111-1111-4111-8111-111111111111';
const occurrenceId = '22222222-2222-4222-8222-222222222222';
const commandId = '33333333-3333-4333-8333-333333333333';

const pendingCommand: CalendarCommand = {
  commandId,
  connectionId,
  operation: 'create',
  event: {
    title: 'Queued while provider was unavailable',
    schedule: {
      type: 'timed',
      startInstant: '2026-09-15T01:00:00.000Z',
      finishInstant: '2026-09-15T02:00:00.000Z',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'fixed_instant',
    },
    recurrence: null,
    location: null,
    providerNotes: null,
  },
};

type RecoveryStore = GoogleCalendarSyncStore &
  Readonly<{
    setConnectionState(
      connectionId: string,
      state: ExternalCalendarConnectionState,
    ): Promise<void>;
  }>;

function provider(overrides: Partial<GoogleCalendarSynchronizationProvider> = {}) {
  const initialImport =
    overrides.initialImport ??
    vi
      .fn<(_connectionId: string) => Promise<SynchronizedImportBatch>>()
      .mockResolvedValue({
        events: [],
        cursor: 'initial-token',
      });
  const pullChanges =
    overrides.pullChanges ??
    vi
      .fn<(_connectionId: string) => Promise<SynchronizedProviderChangeBatch>>()
      .mockResolvedValue({
        changes: [],
        cursor: 'next-token',
      });
  const restoreHiddenEvent = overrides.restoreHiddenEvent ?? vi.fn();
  const applyCommands =
    overrides.applyCommands ??
    vi
      .fn<(_commands: readonly CalendarCommand[]) => Promise<readonly CalendarCommandResult[]>>()
      .mockResolvedValue([
        { commandId, status: 'applied', providerEventId: 'provider-event-after-recovery' },
      ]);
  return {
    value: { initialImport, pullChanges, restoreHiddenEvent, applyCommands },
    initialImport,
    pullChanges,
    applyCommands,
  };
}

function store(initialState: ExternalCalendarConnectionState) {
  let state = initialState;
  const getConnection = vi.fn(async () => ({
    id: connectionId,
    initialSyncDirection: 'external_to_misyra' as const,
    state,
  }));
  const reconcileFullImport = vi.fn().mockResolvedValue(undefined);
  const applyProviderChanges = vi.fn().mockResolvedValue(undefined);
  const listPendingCommands = vi.fn().mockResolvedValue([
    { occurrenceId, command: pendingCommand },
  ]);
  const applyCommandResults = vi.fn().mockResolvedValue(undefined);
  const clearCursor = vi.fn().mockResolvedValue(undefined);
  const setConnectionState = vi.fn(
    async (_connectionId: string, nextState: ExternalCalendarConnectionState) => {
      state = nextState;
    },
  );
  const value: RecoveryStore = {
    getConnection,
    reconcileFullImport,
    applyProviderChanges,
    listPendingCommands,
    applyCommandResults,
    clearCursor,
    setConnectionState,
  };
  return {
    value,
    getConnection,
    applyProviderChanges,
    listPendingCommands,
    applyCommandResults,
    setConnectionState,
  };
}

describe('MTS-075 Google calendar outage and permission recovery', () => {
  it.each([
    ['provider_unavailable', 'provider_unavailable'],
    ['permission_denied', 'permission_revoked'],
    ['authentication_required', 'permission_revoked'],
  ] as const)(
    'records %s as durable connection state %s without discarding queued work',
    async (providerCode, expectedState) => {
      const failure = new ExternalCalendarAdapterError(providerCode, providerCode);
      const calendarProvider = provider({
        pullChanges: vi.fn().mockRejectedValue(failure),
      });
      const syncStore = store('connected');
      const service = createGoogleCalendarSyncService({
        provider: calendarProvider.value,
        store: syncStore.value,
      });

      await expect(service.incrementalSync(connectionId)).rejects.toBe(failure);

      expect(syncStore.setConnectionState).toHaveBeenCalledWith(connectionId, expectedState);
      expect(syncStore.listPendingCommands).not.toHaveBeenCalled();
      expect(calendarProvider.applyCommands).not.toHaveBeenCalled();
    },
  );

  it.each(['provider_unavailable', 'permission_revoked'] as const)(
    'retries from %s, restores connected state, and automatically pushes queued eligible changes',
    async (recoverableState) => {
      const calendarProvider = provider();
      const syncStore = store(recoverableState);
      const service = createGoogleCalendarSyncService({
        provider: calendarProvider.value,
        store: syncStore.value,
      });

      await expect(service.incrementalSync(connectionId)).resolves.toBeUndefined();

      expect(calendarProvider.pullChanges).toHaveBeenCalledWith(connectionId);
      expect(syncStore.applyProviderChanges).toHaveBeenCalledWith(connectionId, {
        changes: [],
        cursor: 'next-token',
      });
      expect(syncStore.setConnectionState).toHaveBeenCalledWith(connectionId, 'connected');
      expect(syncStore.listPendingCommands).toHaveBeenCalledWith(connectionId);
      expect(calendarProvider.applyCommands).toHaveBeenCalledWith([pendingCommand]);
      expect(syncStore.applyCommandResults).toHaveBeenCalledWith(
        connectionId,
        [{ occurrenceId, command: pendingCommand }],
        [{ commandId, status: 'applied', providerEventId: 'provider-event-after-recovery' }],
      );
    },
  );

  it('still refuses explicit disconnected state so a later worker cannot surprise-sync it', async () => {
    const calendarProvider = provider();
    const syncStore = store('disconnected');
    const service = createGoogleCalendarSyncService({
      provider: calendarProvider.value,
      store: syncStore.value,
    });

    await expect(service.incrementalSync(connectionId)).rejects.toMatchObject({
      code: 'authentication_required',
    });
    expect(calendarProvider.pullChanges).not.toHaveBeenCalled();
    expect(calendarProvider.applyCommands).not.toHaveBeenCalled();
  });
});
