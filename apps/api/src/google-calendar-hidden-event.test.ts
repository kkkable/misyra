import { describe, expect, it, vi } from 'vitest';

import type { SynchronizedProviderEvent } from '@misyra/contracts';

import { createGoogleCalendarSyncProvider } from './google-calendar-sync-provider.js';

const connectionId = '11111111-1111-4111-8111-111111111111';

type FetchInput = Parameters<typeof fetch>[0];
type RestoringProvider = ReturnType<typeof createGoogleCalendarSyncProvider> &
  Readonly<{
    restoreHiddenEvent(
      input: Readonly<{
        connectionId: string;
        providerEventId: string;
        recurrenceScope: 'this_occurrence' | 'this_and_future' | 'entire_series';
      }>,
    ): Promise<SynchronizedProviderEvent>;
  }>;

function requestUrl(input: FetchInput): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe('MTS-073 Google hidden-event restoration', () => {
  it('fetches the current provider event instead of restoring a stale local snapshot', async () => {
    const requests: string[] = [];
    const responses = [
      new Response(JSON.stringify({ access_token: 'fresh-access-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      new Response(
        JSON.stringify({
          id: 'provider-event-1',
          status: 'confirmed',
          updated: '2026-09-13T11:30:00.000Z',
          summary: 'Current provider title',
          description: 'Current provider description',
          location: 'Admiralty',
          organizer: { self: false },
          start: {
            dateTime: '2026-09-20T09:00:00+08:00',
            timeZone: 'Asia/Hong_Kong',
          },
          end: {
            dateTime: '2026-09-20T10:00:00+08:00',
            timeZone: 'Asia/Hong_Kong',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ];
    const fetchImpl = vi.fn((input: FetchInput) => {
      requests.push(requestUrl(input));
      const response = responses.shift();
      return response
        ? Promise.resolve(response)
        : Promise.reject(new Error('Unexpected provider request'));
    });
    const provider = createGoogleCalendarSyncProvider({
      clientId: 'google-calendar-client-id',
      clientSecret: 'fixture-google-calendar-client-secret',
      fetchImpl,
      loadSession: vi.fn().mockResolvedValue({
        providerCalendarId: 'calendar-1',
        refreshToken: 'refresh-secret',
        cursor: 'sync-token-previous',
        timeZone: 'Asia/Hong_Kong',
      }),
    }) as RestoringProvider;

    await expect(
      provider.restoreHiddenEvent({
        connectionId,
        providerEventId: 'provider-event-1',
        recurrenceScope: 'this_occurrence',
      }),
    ).resolves.toEqual({
      providerCalendarId: 'calendar-1',
      providerEventId: 'provider-event-1',
      providerUpdatedAt: '2026-09-13T11:30:00.000Z',
      title: 'Current provider title',
      schedule: {
        type: 'timed',
        startInstant: '2026-09-20T01:00:00.000Z',
        finishInstant: '2026-09-20T02:00:00.000Z',
        timeZone: 'Asia/Hong_Kong',
        timeBehavior: 'fixed_instant',
      },
      recurrence: null,
      location: 'Admiralty',
      providerNotes: 'Current provider description',
      status: 'confirmed',
      ownership: 'organizer_controlled',
    });

    expect(requests).toEqual([
      'https://oauth2.googleapis.com/token',
      'https://www.googleapis.com/calendar/v3/calendars/calendar-1/events/provider-event-1',
    ]);
  });
});
