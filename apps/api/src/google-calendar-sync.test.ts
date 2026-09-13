import { describe, expect, it, vi } from 'vitest';

import {
  ExternalCalendarAdapterError,
  type CalendarCommand,
  type CalendarCommandResult,
  type SynchronizedImportBatch,
  type SynchronizedProviderChangeBatch,
} from '@misyra/contracts';

import {
  createGoogleCalendarSyncService,
  type GoogleCalendarSynchronizationProvider,
  type GoogleCalendarSyncStore,
} from './google-calendar-sync.js';

const connectionId = '11111111-1111-4111-8111-111111111111';
const commandId = '22222222-2222-4222-8222-222222222222';
const occurrenceId = '33333333-3333-4333-8333-333333333333';

const providerEvent = {
  providerCalendarId: 'calendar-1',
  providerEventId: 'event-1',
  providerUpdatedAt: '2026-09-13T02:00:00.000Z',
  title: 'Provider event',
  schedule: {
    type: 'timed' as const,
    startInstant: '2026-09-15T01:00:00.000Z',
    finishInstant: '2026-09-15T02:00:00.000Z',
    timeZone: 'Asia/Hong_Kong',
    timeBehavior: 'fixed_instant' as const,
  },
  recurrence: null,
  location: null,
  providerNotes: null,
  status: 'confirmed' as const,
  ownership: 'app_owned' as const,
};

const createCommand: CalendarCommand = {
  commandId,
  connectionId,
  operation: 'create',
  event: {
    title: 'Local mission',
    schedule: providerEvent.schedule,
    recurrence: null,
    location: null,
    providerNotes: null,
  },
};

function provider(overrides: Partial<GoogleCalendarSynchronizationProvider> = {}) {
  const initialImport =
    overrides.initialImport ??
    vi.fn<(_connectionId: string) => Promise<SynchronizedImportBatch>>().mockResolvedValue({
      events: [providerEvent],
      cursor: 'sync-token-full',
    });
  const pullChanges =
    overrides.pullChanges ??
    vi.fn<(_connectionId: string) => Promise<SynchronizedProviderChangeBatch>>().mockResolvedValue({
      changes: [{ type: 'upsert', event: providerEvent }],
      cursor: 'sync-token-next',
    });
  const applyCommands =
    overrides.applyCommands ??
    vi
      .fn<(_commands: readonly CalendarCommand[]) => Promise<readonly CalendarCommandResult[]>>()
      .mockResolvedValue([
        { commandId, status: 'applied', providerEventId: 'created-provider-event' },
      ]);
  const value: GoogleCalendarSynchronizationProvider = {
    initialImport,
    pullChanges,
    applyCommands,
  };
  return { value, initialImport, pullChanges, applyCommands };
}

function store(overrides: Partial<GoogleCalendarSyncStore> = {}) {
  const getConnection =
    overrides.getConnection ??
    vi.fn().mockResolvedValue({
      id: connectionId,
      initialSyncDirection: 'external_to_misyra',
      state: 'connected',
    });
  const reconcileFullImport = overrides.reconcileFullImport ?? vi.fn().mockResolvedValue(undefined);
  const applyProviderChanges =
    overrides.applyProviderChanges ?? vi.fn().mockResolvedValue(undefined);
  const listPendingCommands = overrides.listPendingCommands ?? vi.fn().mockResolvedValue([]);
  const applyCommandResults = overrides.applyCommandResults ?? vi.fn().mockResolvedValue(undefined);
  const clearCursor = overrides.clearCursor ?? vi.fn().mockResolvedValue(undefined);
  const value: GoogleCalendarSyncStore = {
    getConnection,
    reconcileFullImport,
    applyProviderChanges,
    listPendingCommands,
    applyCommandResults,
    clearCursor,
  };
  return {
    value,
    getConnection,
    reconcileFullImport,
    applyProviderChanges,
    listPendingCommands,
    applyCommandResults,
    clearCursor,
  };
}

describe('MTS-070 Google initial and incremental synchronization', () => {
  it('uses the selected external-to-Misyra direction for the initial full import', async () => {
    const calendarProvider = provider();
    const syncStore = store();
    const service = createGoogleCalendarSyncService({
      provider: calendarProvider.value,
      store: syncStore.value,
    });

    await service.initialSync(connectionId);

    expect(calendarProvider.initialImport).toHaveBeenCalledWith(connectionId);
    expect(syncStore.reconcileFullImport).toHaveBeenCalledWith(connectionId, {
      events: [providerEvent],
      cursor: 'sync-token-full',
    });
    expect(calendarProvider.applyCommands).not.toHaveBeenCalled();
  });

  it('exports eligible app missions first when Misyra is the initial source, then captures a full-sync cursor', async () => {
    const calendarProvider = provider();
    const syncStore = store({
      getConnection: vi.fn().mockResolvedValue({
        id: connectionId,
        initialSyncDirection: 'misyra_to_external',
        state: 'connected',
      }),
      listPendingCommands: vi.fn().mockResolvedValue([{ occurrenceId, command: createCommand }]),
    });
    const service = createGoogleCalendarSyncService({
      provider: calendarProvider.value,
      store: syncStore.value,
    });

    await service.initialSync(connectionId);

    expect(calendarProvider.applyCommands).toHaveBeenCalledWith([createCommand]);
    expect(syncStore.applyCommandResults).toHaveBeenCalledWith(
      connectionId,
      [{ occurrenceId, command: createCommand }],
      [{ commandId, status: 'applied', providerEventId: 'created-provider-event' }],
    );
    expect(calendarProvider.initialImport).toHaveBeenCalledWith(connectionId);
    expect(syncStore.reconcileFullImport).toHaveBeenCalledWith(connectionId, {
      events: [providerEvent],
      cursor: 'sync-token-full',
    });
  });

  it('applies provider changes before pushing still-pending local commands during incremental sync', async () => {
    const order: string[] = [];
    const calendarProvider = provider({
      pullChanges: vi.fn(() => {
        order.push('pull');
        return Promise.resolve({
          changes: [{ type: 'upsert' as const, event: providerEvent }],
          cursor: 'sync-token-next',
        });
      }),
      applyCommands: vi.fn(() => {
        order.push('push');
        return Promise.resolve([
          { commandId, status: 'applied' as const, providerEventId: 'event-1' },
        ]);
      }),
    });
    const syncStore = store({
      applyProviderChanges: vi.fn(() => {
        order.push('reconcile');
        return Promise.resolve();
      }),
      listPendingCommands: vi.fn(() => {
        order.push('pending');
        return Promise.resolve([{ occurrenceId, command: createCommand }]);
      }),
    });
    const service = createGoogleCalendarSyncService({
      provider: calendarProvider.value,
      store: syncStore.value,
    });

    await service.incrementalSync(connectionId);

    expect(order).toEqual(['pull', 'reconcile', 'pending', 'push']);
    expect(syncStore.applyProviderChanges).toHaveBeenCalledWith(connectionId, {
      changes: [{ type: 'upsert', event: providerEvent }],
      cursor: 'sync-token-next',
    });
  });

  it('recovers an invalid Google sync token with one controlled full resync', async () => {
    const calendarProvider = provider({
      pullChanges: vi
        .fn()
        .mockRejectedValue(
          new ExternalCalendarAdapterError('invalid_sync_cursor', 'invalid_sync_cursor'),
        ),
    });
    const syncStore = store();
    const service = createGoogleCalendarSyncService({
      provider: calendarProvider.value,
      store: syncStore.value,
    });

    await service.incrementalSync(connectionId);

    expect(syncStore.clearCursor).toHaveBeenCalledWith(connectionId);
    expect(calendarProvider.initialImport).toHaveBeenCalledTimes(1);
    expect(syncStore.reconcileFullImport).toHaveBeenCalledTimes(1);
  });

  it('does not convert unrelated provider failures into destructive full resyncs', async () => {
    const failure = new ExternalCalendarAdapterError(
      'provider_unavailable',
      'provider_unavailable',
    );
    const calendarProvider = provider({ pullChanges: vi.fn().mockRejectedValue(failure) });
    const syncStore = store();
    const service = createGoogleCalendarSyncService({
      provider: calendarProvider.value,
      store: syncStore.value,
    });

    await expect(service.incrementalSync(connectionId)).rejects.toBe(failure);
    expect(syncStore.clearCursor).not.toHaveBeenCalled();
    expect(calendarProvider.initialImport).not.toHaveBeenCalled();
  });
});
