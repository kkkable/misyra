import { describe, expect, it, vi } from 'vitest';

import { createAppleCalendarRemoteCommandExecutor } from './apple-calendar-remote-command-executor.js';

const connection = {
  id: '11111111-1111-4111-8111-111111111111',
  providerCalendarId: 'apple-calendar-1',
};
const occurrenceId = '22222222-2222-4222-8222-222222222222';
const commandId = '33333333-3333-4333-8333-333333333333';
const claimToken = '44444444-4444-4444-8444-444444444444';
const event = {
  title: 'Provider-safe mission',
  schedule: {
    type: 'timed',
    startInstant: '2026-09-17T01:00:00.000Z',
    finishInstant: '2026-09-17T02:00:00.000Z',
    timeZone: 'Asia/Tokyo',
    timeBehavior: 'local_time',
  },
  recurrence: null,
  location: null,
  providerNotes: null,
};

function linkStore() {
  let link = null;
  return {
    findByOccurrenceId: vi.fn(() => Promise.resolve(link)),
    save: vi.fn((value) => {
      link = value;
      return Promise.resolve();
    }),
  };
}

function nativeModule() {
  return {
    createEvent: vi.fn(() => Promise.resolve({ eventIdentifier: 'eventkit-created-1' })),
    updateEvent: vi.fn(() => Promise.resolve({ eventIdentifier: 'eventkit-updated-1' })),
    deleteEvent: vi.fn(() => Promise.resolve()),
  };
}

describe('MTS-077 remote Apple Calendar command executor', () => {
  it('reuses a retained created identifier when settlement is retried', async () => {
    const links = linkStore();
    const native = nativeModule();
    const claim = {
      claimToken,
      occurrenceId,
      providerCalendarId: connection.providerCalendarId,
      command: {
        commandId,
        connectionId: connection.id,
        operation: 'create',
        event,
      },
    };
    const api = {
      claim: vi.fn(() => Promise.resolve(claim)),
      settle: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline_after_eventkit_create'))
        .mockResolvedValueOnce(undefined),
    };
    const executor = createAppleCalendarRemoteCommandExecutor({
      api,
      nativeModule: native,
      linkStore: links,
      connection,
    });

    await expect(executor.runOne()).rejects.toThrow('offline_after_eventkit_create');
    expect(native.createEvent).toHaveBeenCalledTimes(1);
    expect(links.save).toHaveBeenCalledWith({
      occurrenceId,
      connectionId: connection.id,
      providerCalendarId: connection.providerCalendarId,
      providerEventId: 'eventkit-created-1',
    });

    await expect(executor.runOne()).resolves.toEqual({ status: 'applied', operation: 'create' });
    expect(native.createEvent).toHaveBeenCalledTimes(1);
    expect(api.settle).toHaveBeenLastCalledWith(claimToken, {
      commandId,
      status: 'applied',
      providerEventId: 'eventkit-created-1',
    });
  });

  it('passes provider recurrence scope through update and delete commands', async () => {
    const links = linkStore();
    const native = nativeModule();
    const claims = [
      {
        claimToken,
        occurrenceId,
        providerCalendarId: connection.providerCalendarId,
        command: {
          commandId,
          connectionId: connection.id,
          operation: 'update',
          providerEventId: 'eventkit-existing-1',
          recurrenceScope: 'entire_series',
          patch: event,
        },
      },
      {
        claimToken: '55555555-5555-4555-8555-555555555555',
        occurrenceId,
        providerCalendarId: connection.providerCalendarId,
        command: {
          commandId: '66666666-6666-4666-8666-666666666666',
          connectionId: connection.id,
          operation: 'delete',
          providerEventId: 'eventkit-updated-1',
          recurrenceScope: 'entire_series',
        },
      },
    ];
    const api = {
      claim: vi.fn(() => Promise.resolve(claims.shift() ?? null)),
      settle: vi.fn(() => Promise.resolve()),
    };
    const executor = createAppleCalendarRemoteCommandExecutor({
      api,
      nativeModule: native,
      linkStore: links,
      connection,
    });

    await expect(executor.runOne()).resolves.toEqual({ status: 'applied', operation: 'update' });
    expect(native.updateEvent).toHaveBeenCalledWith(
      'eventkit-existing-1',
      event,
      'entire_series',
    );

    await expect(executor.runOne()).resolves.toEqual({ status: 'applied', operation: 'delete' });
    expect(native.deleteEvent).toHaveBeenCalledWith('eventkit-updated-1', 'entire_series');
  });
});
