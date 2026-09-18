import { describe, expect, it, vi } from 'vitest';

import { createAppleCalendarMobileSync } from './apple-calendar-mobile-sync.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const connectionId = '33333333-3333-4333-8333-333333333333';
const existingOccurrenceId = '44444444-4444-4444-8444-444444444444';
const existingSeriesId = '55555555-5555-4555-8555-555555555555';

function nativeEvent(overrides = {}) {
  return {
    eventIdentifier: 'apple-event-1',
    calendarIdentifier: 'apple-calendar-1',
    title: 'Provider title',
    startDate: '2026-09-16T01:00:00.000Z',
    endDate: '2026-09-16T02:00:00.000Z',
    isAllDay: false,
    timeZone: 'Asia/Tokyo',
    location: 'Provider room',
    providerNotes: 'Provider notes',
    recurrence: null,
    ...overrides,
  };
}

function connection(overrides = {}) {
  return {
    id: connectionId,
    provider: 'apple',
    providerCalendarId: 'apple-calendar-1',
    initialSyncDirection: 'external_to_misyra',
    state: 'connected',
    ...overrides,
  };
}

function createHarness({
  moduleAvailable = true,
  authorization = 'full_access',
  selectedConnection = connection(),
  links = new Map(),
  missions = new Map(),
  pendingCommands = [],
  events = [nativeEvent()],
} = {}) {
  let storeChangedListener = null;
  const nativeModule = moduleAvailable
    ? {
        getAuthorizationStatus: vi.fn(() => Promise.resolve(authorization)),
        fetchEvents: vi.fn(() => Promise.resolve(events)),
        createEvent: vi.fn((calendarId, event) =>
          Promise.resolve(
            nativeEvent({
              eventIdentifier: `created-${event.title}`,
              calendarIdentifier: calendarId,
              title: event.title,
            }),
          ),
        ),
        updateEvent: vi.fn((eventIdentifier, event) =>
          Promise.resolve(nativeEvent({ eventIdentifier, title: event.title })),
        ),
        deleteEvent: vi.fn(() => Promise.resolve()),
        addListener: vi.fn((name, listener) => {
          expect(name).toBe('onStoreChanged');
          storeChangedListener = listener;
          return { remove: vi.fn() };
        }),
      }
    : null;

  const store = {
    findLinkByProviderEventId: vi.fn((providerEventId) =>
      Promise.resolve(links.get(providerEventId) ?? null),
    ),
    getMissionSyncState: vi.fn((occurrenceId) =>
      Promise.resolve(missions.get(occurrenceId) ?? null),
    ),
    enqueueProviderMutation: vi.fn(() => Promise.resolve()),
    relinkProviderEvent: vi.fn(() => Promise.resolve()),
    listPendingAppleCommands: vi.fn(() => Promise.resolve(pendingCommands)),
    settleAppleCommand: vi.fn(() => Promise.resolve()),
  };

  const generated = [
    '66666666-6666-4666-8666-666666666666',
    '77777777-7777-4777-8777-777777777777',
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999999',
  ];
  const sync = createAppleCalendarMobileSync({
    accountId,
    deviceId,
    connection: selectedConnection,
    nativeModule,
    store,
    now: () => new Date('2026-09-16T00:00:00.000Z'),
    generateId: () => generated.shift() ?? crypto.randomUUID(),
  });

  return {
    sync,
    nativeModule,
    store,
    emitStoreChanged: async () => {
      if (storeChangedListener === null)
        throw new Error('store-change listener was not registered');
      storeChangedListener({ changed: true });
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('MTS-077 EventKit mobile sync integration', () => {
  it('keeps cached internal data untouched while the native adapter is unavailable or unauthorized', async () => {
    const unavailable = createHarness({ moduleAvailable: false });
    await expect(unavailable.sync.runForeground()).resolves.toEqual({
      status: 'inactive',
      reason: 'adapter_unavailable',
    });
    expect(unavailable.store.enqueueProviderMutation).not.toHaveBeenCalled();
    expect(unavailable.store.relinkProviderEvent).not.toHaveBeenCalled();

    const denied = createHarness({ authorization: 'denied' });
    await expect(denied.sync.runForeground()).resolves.toEqual({
      status: 'inactive',
      reason: 'permission_denied',
    });
    expect(denied.nativeModule.fetchEvents).not.toHaveBeenCalled();
    expect(denied.store.enqueueProviderMutation).not.toHaveBeenCalled();
  });

  it('queues EventKit pulls as normal server-bound local mutations even when the server is offline', async () => {
    const harness = createHarness();

    await expect(harness.sync.runForeground()).resolves.toMatchObject({
      status: 'synchronized',
      providerChangesQueued: 1,
    });

    expect(harness.nativeModule.fetchEvents).toHaveBeenCalledWith(
      'apple-calendar-1',
      '2026-09-16T00:00:00.000Z',
      expect.any(String),
    );
    expect(harness.store.enqueueProviderMutation).toHaveBeenCalledTimes(1);
    expect(harness.store.enqueueProviderMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: { kind: 'server' },
        operation: 'create',
        provider: 'apple',
        connectionId,
        providerEventId: 'apple-event-1',
        providerCalendarId: 'apple-calendar-1',
        ownership: 'organizer_controlled',
        event: expect.objectContaining({
          title: 'Provider title',
          schedule: expect.objectContaining({
            startInstant: '2026-09-16T01:00:00.000Z',
            finishInstant: '2026-09-16T02:00:00.000Z',
            timeZone: 'Asia/Tokyo',
          }),
        }),
      }),
    );
  });

  it('reconnects the same provider event to retained identifiers instead of creating a duplicate mission', async () => {
    const links = new Map([
      [
        'apple-event-1',
        {
          occurrenceId: existingOccurrenceId,
          seriesId: existingSeriesId,
          providerCalendarId: 'apple-calendar-1',
          connectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          ownership: 'organizer_controlled',
        },
      ],
    ]);
    const missions = new Map([
      [
        existingOccurrenceId,
        { completionState: 'incomplete', serverVersion: 7, calendarSource: 'external' },
      ],
    ]);
    const harness = createHarness({ links, missions });

    await harness.sync.runForeground();

    expect(harness.store.relinkProviderEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        occurrenceId: existingOccurrenceId,
        providerEventId: 'apple-event-1',
        connectionId,
      }),
    );
    expect(harness.store.enqueueProviderMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'update',
        occurrenceId: existingOccurrenceId,
        seriesId: existingSeriesId,
        baseVersion: 7,
      }),
    );
  });

  it('keeps completed imported missions frozen while still relinking retained provider identifiers', async () => {
    const links = new Map([
      [
        'apple-event-1',
        {
          occurrenceId: existingOccurrenceId,
          seriesId: existingSeriesId,
          providerCalendarId: 'apple-calendar-1',
          connectionId,
          ownership: 'organizer_controlled',
        },
      ],
    ]);
    const missions = new Map([
      [
        existingOccurrenceId,
        { completionState: 'completed', serverVersion: 9, calendarSource: 'external' },
      ],
    ]);
    const harness = createHarness({ links, missions });

    await expect(harness.sync.runForeground()).resolves.toMatchObject({ frozenProviderEvents: 1 });

    expect(harness.store.relinkProviderEvent).toHaveBeenCalledTimes(1);
    expect(harness.store.enqueueProviderMutation).not.toHaveBeenCalled();
  });

  it('executes queued Apple provider commands on-device and settles returned provider identifiers', async () => {
    const pendingCommands = [
      {
        mutationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        occurrenceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        operation: 'create',
        event: {
          title: 'Create me',
          schedule: {
            type: 'timed',
            startInstant: '2026-09-16T03:00:00.000Z',
            finishInstant: '2026-09-16T04:00:00.000Z',
            timeZone: 'Asia/Tokyo',
            timeBehavior: 'fixed_instant',
          },
          recurrence: null,
          location: null,
          providerNotes: null,
        },
      },
      {
        mutationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        occurrenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        operation: 'update',
        providerEventId: 'apple-event-update',
        event: {
          title: 'Updated',
          schedule: {
            type: 'timed',
            startInstant: '2026-09-16T05:00:00.000Z',
            finishInstant: '2026-09-16T06:00:00.000Z',
            timeZone: 'Asia/Tokyo',
            timeBehavior: 'fixed_instant',
          },
          recurrence: null,
          location: null,
          providerNotes: null,
        },
      },
      {
        mutationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        occurrenceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        operation: 'delete',
        providerEventId: 'apple-event-delete',
      },
    ];
    const harness = createHarness({ events: [], pendingCommands });

    await expect(harness.sync.runForeground()).resolves.toMatchObject({ commandsApplied: 3 });

    expect(harness.nativeModule.createEvent).toHaveBeenCalledTimes(1);
    expect(harness.nativeModule.updateEvent).toHaveBeenCalledWith(
      'apple-event-update',
      expect.objectContaining({ title: 'Updated' }),
    );
    expect(harness.nativeModule.deleteEvent).toHaveBeenCalledWith('apple-event-delete');
    expect(harness.store.settleAppleCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        occurrenceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        providerEventId: 'created-Create me',
        connectionId,
      }),
    );
  });

  it('runs serialized foreground refreshes for EventKit store changes and exposes best-effort background refresh', async () => {
    const harness = createHarness({ events: [] });
    const subscription = harness.sync.subscribeStoreChanges();

    await harness.emitStoreChanged();
    await harness.sync.runBestEffortBackground();

    expect(harness.nativeModule.fetchEvents).toHaveBeenCalledTimes(2);
    subscription.remove();
  });
});
