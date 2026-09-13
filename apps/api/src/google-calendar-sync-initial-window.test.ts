import { describe, expect, it, vi } from 'vitest';

import { createGoogleCalendarSyncProvider } from './google-calendar-sync-provider.js';

const connectionId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-09-13T03:00:00.000Z');

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function requestUrl(input: FetchInput): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function providerFor(items: readonly unknown[]) {
  const responses = [
    new Response(JSON.stringify({ access_token: 'fresh-access-token' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    new Response(JSON.stringify({ items, nextSyncToken: 'sync-token-next' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ];
  const fetchImpl = vi.fn((input: FetchInput, _init?: FetchInit) => {
    requestUrl(input);
    const response = responses.shift();
    return response
      ? Promise.resolve(response)
      : Promise.reject(new Error('Unexpected provider request'));
  });

  return createGoogleCalendarSyncProvider({
    clientId: 'google-calendar-client-id',
    clientSecret: 'fixture-google-calendar-client-secret',
    fetchImpl,
    now: () => now,
    loadSession: vi.fn().mockResolvedValue({
      providerCalendarId: 'calendar-1',
      refreshToken: 'refresh-secret',
      cursor: null,
      timeZone: 'Asia/Hong_Kong',
    }),
  });
}

function timedEvent(
  id: string,
  startDateTime: string,
  finishDateTime: string,
  recurrence?: readonly string[],
) {
  return {
    id,
    status: 'confirmed',
    updated: '2026-09-13T02:00:00.000Z',
    summary: id,
    organizer: { self: true },
    start: { dateTime: startDateTime, timeZone: 'Asia/Hong_Kong' },
    end: { dateTime: finishDateTime, timeZone: 'Asia/Hong_Kong' },
    ...(recurrence === undefined ? {} : { recurrence }),
  };
}

describe('MTS-070 future-only initial Google migration', () => {
  it('leaves past one-time provider events unchanged during initial import', async () => {
    const provider = providerFor([
      timedEvent('past', '2026-09-12T09:00:00+08:00', '2026-09-12T10:00:00+08:00'),
      timedEvent('future', '2026-09-15T09:00:00+08:00', '2026-09-15T10:00:00+08:00'),
    ]);

    const batch = await provider.initialImport(connectionId);

    expect(batch.events.map((event) => event.providerEventId)).toEqual(['future']);
    expect(batch.cursor).toBe('sync-token-next');
  });

  it('reanchors a recurring provider series to its first unfinished occurrence', async () => {
    const provider = providerFor([
      timedEvent(
        'weekly',
        '2026-09-01T09:00:00+08:00',
        '2026-09-01T10:00:00+08:00',
        ['RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=TU;WKST=MO'],
      ),
    ]);

    const batch = await provider.initialImport(connectionId);

    expect(batch.events).toHaveLength(1);
    expect(batch.events[0]).toMatchObject({
      providerEventId: 'weekly',
      schedule: {
        type: 'timed',
        startInstant: '2026-09-15T01:00:00.000Z',
        finishInstant: '2026-09-15T02:00:00.000Z',
        timeZone: 'Asia/Hong_Kong',
      },
      recurrence: {
        pattern: {
          type: 'weekly',
          interval: 1,
          weekdays: [2],
          weekStartsOn: 1,
        },
        end: { type: 'count', occurrenceCount: 2 },
      },
    });
  });

  it('omits recurring provider series with no unfinished occurrence remaining', async () => {
    const provider = providerFor([
      timedEvent(
        'exhausted',
        '2026-09-01T09:00:00+08:00',
        '2026-09-01T10:00:00+08:00',
        ['RRULE:FREQ=WEEKLY;COUNT=2;BYDAY=TU;WKST=MO'],
      ),
    ]);

    const batch = await provider.initialImport(connectionId);

    expect(batch.events).toEqual([]);
    expect(batch.cursor).toBe('sync-token-next');
  });
});
