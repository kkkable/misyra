import { describe, expect, it, vi } from 'vitest';

import { createGoogleCalendarHiddenEventService } from './google-calendar-hidden-events.js';

const accountId = '00000000-0000-4000-8000-000000000073';
const connectionId = '00000000-0000-4000-8000-000000000173';
const futureHiddenId = '00000000-0000-4000-8000-000000000273';
const pastHiddenId = '00000000-0000-4000-8000-000000000373';

function dismissal(id: string, providerEventId: string) {
  return {
    id,
    accountId,
    connectionId,
    provider: 'google',
    providerCalendarId: 'calendar-1',
    providerEventId,
    recurrenceScope: 'this_occurrence' as const,
    effectiveStart: new Date('2026-09-20T01:00:00.000Z'),
    effectiveEnd: new Date('2026-09-20T02:00:00.000Z'),
    hiddenAt: new Date('2026-09-13T12:00:00.000Z'),
  };
}

function providerEvent(providerEventId: string, startInstant: string, finishInstant: string) {
  return {
    providerCalendarId: 'calendar-1',
    providerEventId,
    providerUpdatedAt: '2026-09-14T00:00:00.000Z',
    title: providerEventId === 'future-event' ? 'Current future title' : 'Past title',
    schedule: {
      type: 'timed' as const,
      startInstant,
      finishInstant,
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'fixed_instant' as const,
    },
    recurrence: null,
    location: null,
    providerNotes: null,
    status: 'confirmed' as const,
    ownership: 'organizer_controlled' as const,
  };
}

describe('MTS-073 hidden calendar event service', () => {
  it('returns upcoming hidden events with current provider details only', async () => {
    const future = dismissal(futureHiddenId, 'future-event');
    const past = dismissal(pastHiddenId, 'past-event');
    const store = {
      listHiddenEvents: vi.fn().mockResolvedValue([future, past]),
      getHiddenEvent: vi.fn(),
      restoreHiddenEventById: vi.fn(),
    };
    const restoreHiddenEvent = vi.fn(({ providerEventId }: { providerEventId: string }) => {
      const event =
        providerEventId === 'future-event'
          ? providerEvent(providerEventId, '2026-09-20T01:00:00.000Z', '2026-09-20T02:00:00.000Z')
          : providerEvent(providerEventId, '2026-09-10T01:00:00.000Z', '2026-09-10T02:00:00.000Z');
      return Promise.resolve(event);
    });
    const provider = { restoreHiddenEvent };
    const service = createGoogleCalendarHiddenEventService({
      store,
      provider,
      now: () => new Date('2026-09-14T00:00:00.000Z'),
    });

    await expect(service.listHiddenEvents(accountId)).resolves.toEqual([
      {
        id: futureHiddenId,
        connectionId,
        providerEventId: 'future-event',
        recurrenceScope: 'this_occurrence',
        title: 'Current future title',
        schedule: providerEvent(
          'future-event',
          '2026-09-20T01:00:00.000Z',
          '2026-09-20T02:00:00.000Z',
        ).schedule,
        isRecurring: false,
      },
    ]);
  });

  it('fetches current provider details before restoring the selected dismissal', async () => {
    const hidden = dismissal(futureHiddenId, 'future-event');
    const current = providerEvent(
      'future-event',
      '2026-09-21T01:00:00.000Z',
      '2026-09-21T02:00:00.000Z',
    );
    const restoreHiddenEventById = vi
      .fn()
      .mockResolvedValue({ occurrenceId: '00000000-0000-4000-8000-000000000473' });
    const store = {
      listHiddenEvents: vi.fn(),
      getHiddenEvent: vi.fn().mockResolvedValue(hidden),
      restoreHiddenEventById,
    };
    const provider = { restoreHiddenEvent: vi.fn().mockResolvedValue(current) };
    const service = createGoogleCalendarHiddenEventService({ store, provider });

    await service.restoreHiddenEvent(accountId, futureHiddenId, 'this_and_future');

    expect(provider.restoreHiddenEvent).toHaveBeenCalledWith({
      connectionId,
      providerEventId: 'future-event',
      recurrenceScope: 'this_and_future',
    });
    expect(restoreHiddenEventById).toHaveBeenCalledWith(accountId, futureHiddenId, {
      recurrenceScope: 'this_and_future',
      event: current,
    });
  });
});
