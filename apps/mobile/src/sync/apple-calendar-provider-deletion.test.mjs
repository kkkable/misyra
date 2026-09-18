import { describe, expect, it, vi } from 'vitest';

import { createAppleCalendarMobileSync } from './apple-calendar-mobile-sync.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const connectionId = '33333333-3333-4333-8333-333333333333';
const occurrenceId = '44444444-4444-4444-8444-444444444444';
const seriesId = '55555555-5555-4555-8555-555555555555';

function connection() {
  return {
    id: connectionId,
    provider: 'apple',
    providerCalendarId: 'apple-calendar-1',
    initialSyncDirection: 'external_to_misyra',
    state: 'connected',
  };
}

describe('MTS-077 EventKit provider deletion reconciliation', () => {
  it('confirms a missing snapshot event by retained identifier before queuing provider deletion', async () => {
    const nativeModule = {
      getAuthorizationStatus: vi.fn(() => Promise.resolve('full_access')),
      fetchEvents: vi.fn(() => Promise.resolve([])),
      fetchEvent: vi.fn(() => Promise.resolve(null)),
      createEvent: vi.fn(),
      updateEvent: vi.fn(),
      deleteEvent: vi.fn(),
      addListener: vi.fn(),
    };
    const store = {
      findLinkByProviderEventId: vi.fn(() => Promise.resolve(null)),
      getMissionSyncState: vi.fn(() => Promise.resolve(null)),
      enqueueProviderMutation: vi.fn(() => Promise.resolve()),
      relinkProviderEvent: vi.fn(() => Promise.resolve()),
      listPendingAppleCommands: vi.fn(() => Promise.resolve([])),
      settleAppleCommand: vi.fn(() => Promise.resolve()),
      listLinkedProviderEventsInWindow: vi.fn(() =>
        Promise.resolve([
          {
            occurrenceId,
            seriesId,
            providerEventId: 'apple-event-deleted',
            providerCalendarId: 'apple-calendar-1',
            connectionId,
            ownership: 'organizer_controlled',
            completionState: 'incomplete',
            serverVersion: 7,
          },
        ]),
      ),
    };

    const sync = createAppleCalendarMobileSync({
      accountId,
      deviceId,
      connection: connection(),
      nativeModule,
      store,
      now: () => new Date('2026-09-16T00:00:00.000Z'),
      generateId: () => '66666666-6666-4666-8666-666666666666',
    });

    await expect(sync.runForeground()).resolves.toMatchObject({
      status: 'synchronized',
      providerChangesQueued: 1,
    });
    expect(store.listLinkedProviderEventsInWindow).toHaveBeenCalledWith(
      '2026-09-16T00:00:00.000Z',
      expect.any(String),
    );
    expect(nativeModule.fetchEvent).toHaveBeenCalledWith('apple-event-deleted');
    expect(store.enqueueProviderMutation).toHaveBeenCalledWith({
      destination: { kind: 'server' },
      operation: 'delete',
      provider: 'apple',
      connectionId,
      providerCalendarId: 'apple-calendar-1',
      providerEventId: 'apple-event-deleted',
      ownership: 'organizer_controlled',
      occurrenceId,
      seriesId,
      baseVersion: 7,
    });
  });

  it('reconciles retained past links by identifier even when they are outside the future bulk-fetch window', async () => {
    const nativeModule = {
      getAuthorizationStatus: vi.fn(() => Promise.resolve('full_access')),
      fetchEvents: vi.fn(() => Promise.resolve([])),
      fetchEvent: vi.fn(() => Promise.resolve(null)),
      createEvent: vi.fn(),
      updateEvent: vi.fn(),
      deleteEvent: vi.fn(),
      addListener: vi.fn(),
    };
    const store = {
      findLinkByProviderEventId: vi.fn(() => Promise.resolve(null)),
      getMissionSyncState: vi.fn(() => Promise.resolve(null)),
      enqueueProviderMutation: vi.fn(() => Promise.resolve()),
      relinkProviderEvent: vi.fn(() => Promise.resolve()),
      listPendingAppleCommands: vi.fn(() => Promise.resolve([])),
      settleAppleCommand: vi.fn(() => Promise.resolve()),
      listLinkedProviderEvents: vi.fn(() =>
        Promise.resolve([
          {
            occurrenceId,
            seriesId,
            providerEventId: 'apple-past-event-deleted',
            providerCalendarId: 'apple-calendar-1',
            connectionId,
            ownership: 'organizer_controlled',
            completionState: 'incomplete',
            serverVersion: 8,
          },
        ]),
      ),
    };

    const sync = createAppleCalendarMobileSync({
      accountId,
      deviceId,
      connection: connection(),
      nativeModule,
      store,
      now: () => new Date('2026-09-16T00:00:00.000Z'),
      generateId: () => '77777777-7777-4777-8777-777777777777',
    });

    await expect(sync.runForeground()).resolves.toMatchObject({
      status: 'synchronized',
      providerChangesQueued: 1,
    });
    expect(store.listLinkedProviderEvents).toHaveBeenCalledTimes(1);
    expect(nativeModule.fetchEvent).toHaveBeenCalledWith('apple-past-event-deleted');
    expect(store.enqueueProviderMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'delete',
        providerEventId: 'apple-past-event-deleted',
        occurrenceId,
        seriesId,
        baseVersion: 8,
      }),
    );
  });

});
