import { describe, expect, it, vi } from 'vitest';

import {
  ExternalCalendarAdapterError,
  type CalendarCommand,
  type ExternalCalendarConnectionState,
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

interface RecoveryStore extends GoogleCalendarSyncStore {
  setConnectionState(connectionId: string, state: ExternalCalendarConnectionState): Promise<void>;
}

function createProvider(
  pullChanges = vi.fn(() => Promise.resolve({ changes: [], cursor: 'next-token' })),
) {
  const applyCommands = vi.fn(() =>
    Promise.resolve([
      { commandId, status: 'applied' as const, providerEventId: 'provider-event-after-recovery' },
    ]),
  );
  const value: GoogleCalendarSynchronizationProvider = {
    initialImport: vi.fn(() => Promise.resolve({ events: [], cursor: 'initial-token' })),
    pullChanges,
    restoreHiddenEvent: vi.fn(),
    applyCommands,
  };
  return { value, pullChanges, applyCommands };
}

function createStore(initialState: ExternalCalendarConnectionState) {
  let state = initialState;
  const setConnectionState = vi.fn(
    (_connectionId: string, nextState: ExternalCalendarConnectionState) => {
      state = nextState;
      return Promise.resolve();
    },
  );
  const listPendingCommands = vi.fn(() =>
    Promise.resolve([{ occurrenceId, command: pendingCommand }]),
  );
  const applyCommandResults = vi.fn(() => Promise.resolve());
  const applyProviderChanges = vi.fn(() => Promise.resolve());
  const value: RecoveryStore = {
    getConnection: vi.fn(() =>
      Promise.resolve({
        id: connectionId,
        initialSyncDirection: 'external_to_misyra',
        state,
      }),
    ),
    reconcileFullImport: vi.fn(() => Promise.resolve()),
    applyProviderChanges,
    listPendingCommands,
    applyCommandResults,
    clearCursor: vi.fn(() => Promise.resolve()),
    setConnectionState,
  };
  return {
    value,
    setConnectionState,
    listPendingCommands,
    applyCommandResults,
    applyProviderChanges,
  };
}

async function expectFailureState(
  code: 'provider_unavailable' | 'permission_denied' | 'authentication_required',
  expectedState: ExternalCalendarConnectionState,
) {
  const failure = new ExternalCalendarAdapterError(code, code);
  const pullChanges = vi.fn(() => Promise.reject(failure));
  const provider = createProvider(pullChanges);
  const store = createStore('connected');
  const service = createGoogleCalendarSyncService({ provider: provider.value, store: store.value });

  await expect(service.incrementalSync(connectionId)).rejects.toBe(failure);

  expect(store.setConnectionState).toHaveBeenCalledWith(connectionId, expectedState);
  expect(store.listPendingCommands).not.toHaveBeenCalled();
  expect(provider.applyCommands).not.toHaveBeenCalled();
}

async function expectRecovery(initialState: 'provider_unavailable' | 'permission_revoked') {
  const provider = createProvider();
  const store = createStore(initialState);
  const service = createGoogleCalendarSyncService({ provider: provider.value, store: store.value });

  await expect(service.incrementalSync(connectionId)).resolves.toBeUndefined();

  expect(provider.pullChanges).toHaveBeenCalledWith(connectionId);
  expect(store.applyProviderChanges).toHaveBeenCalledWith(connectionId, {
    changes: [],
    cursor: 'next-token',
  });
  expect(store.setConnectionState).toHaveBeenCalledWith(connectionId, 'connected');
  expect(provider.applyCommands).toHaveBeenCalledWith([pendingCommand]);
  expect(store.applyCommandResults).toHaveBeenCalled();
}

describe('MTS-075 Google calendar outage and permission recovery', () => {
  it('records provider outage without discarding queued work', async () => {
    await expectFailureState('provider_unavailable', 'provider_unavailable');
  });

  it('records permission loss without discarding queued work', async () => {
    await expectFailureState('permission_denied', 'permission_revoked');
    await expectFailureState('authentication_required', 'permission_revoked');
  });

  it('recovers provider outage and pushes queued changes automatically', async () => {
    await expectRecovery('provider_unavailable');
  });

  it('recovers restored permission and pushes queued changes automatically', async () => {
    await expectRecovery('permission_revoked');
  });

  it('never retries an explicitly disconnected connection', async () => {
    const provider = createProvider();
    const store = createStore('disconnected');
    const service = createGoogleCalendarSyncService({
      provider: provider.value,
      store: store.value,
    });

    await expect(service.incrementalSync(connectionId)).rejects.toMatchObject({
      code: 'authentication_required',
    });
    expect(provider.pullChanges).not.toHaveBeenCalled();
    expect(provider.applyCommands).not.toHaveBeenCalled();
  });
});
