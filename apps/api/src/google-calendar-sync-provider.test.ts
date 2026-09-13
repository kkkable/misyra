import { describe, expect, it, vi } from 'vitest';

import { ExternalCalendarAdapterError, type CalendarCommand } from '@misyra/contracts';

import { createGoogleCalendarSyncProvider } from './google-calendar-sync-provider.js';

const connectionId = '11111111-1111-4111-8111-111111111111';
const commandId = '22222222-2222-4222-8222-222222222222';

const configuration = {
  clientId: 'google-calendar-client-id',
  clientSecret: 'fixture-google-calendar-client-secret',
};

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type CapturedRequest = Readonly<{ url: string; init: FetchInit }>;

function requestUrl(input: FetchInput): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestBody(init: FetchInit): string {
  const body = init?.body;
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  throw new Error('Unexpected request body type');
}

function requestAt(requests: readonly CapturedRequest[], index: number): CapturedRequest {
  const request = requests[index];
  if (!request) throw new Error(`Missing captured request at index ${String(index)}`);
  return request;
}

function createProvider(fetchImpl: typeof fetch) {
  return createGoogleCalendarSyncProvider({
    ...configuration,
    fetchImpl,
    loadSession: vi.fn().mockResolvedValue({
      providerCalendarId: 'calendar-1',
      refreshToken: 'refresh-secret',
      cursor: 'sync-token-previous',
    }),
  });
}

const recordedTimedEvent = {
  id: 'event-1',
  status: 'confirmed',
  updated: '2026-09-13T02:00:00.000Z',
  summary: 'Provider event',
  description: 'Provider note',
  location: 'Central',
  organizer: { self: true },
  start: {
    dateTime: '2026-09-15T09:00:00+08:00',
    timeZone: 'Asia/Hong_Kong',
  },
  end: {
    dateTime: '2026-09-15T10:00:00+08:00',
    timeZone: 'Asia/Hong_Kong',
  },
};

describe('MTS-070 concrete Google synchronization provider', () => {
  it('preserves one full-sync query shape across pages and returns the final sync token', async () => {
    const requests: CapturedRequest[] = [];
    const responses = [
      new Response(JSON.stringify({ access_token: 'fresh-access-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      new Response(JSON.stringify({ items: [recordedTimedEvent], nextPageToken: 'page-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      new Response(JSON.stringify({ items: [], nextSyncToken: 'sync-token-next' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ];
    const fetchImpl = vi.fn((input: FetchInput, init?: FetchInit) => {
      requests.push({ url: requestUrl(input), init });
      const response = responses.shift();
      return response
        ? Promise.resolve(response)
        : Promise.reject(new Error('Unexpected provider request'));
    });
    const provider = createProvider(fetchImpl);

    await expect(provider.initialImport(connectionId)).resolves.toEqual({
      events: [
        {
          providerCalendarId: 'calendar-1',
          providerEventId: 'event-1',
          providerUpdatedAt: '2026-09-13T02:00:00.000Z',
          title: 'Provider event',
          schedule: {
            type: 'timed',
            startInstant: '2026-09-15T01:00:00.000Z',
            finishInstant: '2026-09-15T02:00:00.000Z',
            timeZone: 'Asia/Hong_Kong',
            timeBehavior: 'fixed_instant',
          },
          recurrence: null,
          location: 'Central',
          providerNotes: 'Provider note',
          status: 'confirmed',
          ownership: 'app_owned',
        },
      ],
      cursor: 'sync-token-next',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const firstListUrl = new URL(requestAt(requests, 1).url);
    const secondListUrl = new URL(requestAt(requests, 2).url);
    expect(firstListUrl.pathname).toBe('/calendar/v3/calendars/calendar-1/events');
    expect(firstListUrl.searchParams.get('showDeleted')).toBe('true');
    expect(firstListUrl.searchParams.get('singleEvents')).toBe('false');
    expect(firstListUrl.searchParams.get('maxResults')).toBe('250');
    expect(firstListUrl.searchParams.has('timeMin')).toBe(false);
    expect(firstListUrl.searchParams.has('timeMax')).toBe(false);
    expect(firstListUrl.searchParams.has('updatedMin')).toBe(false);
    expect(firstListUrl.searchParams.has('orderBy')).toBe(false);
    expect(firstListUrl.searchParams.has('q')).toBe(false);
    expect(secondListUrl.searchParams.get('pageToken')).toBe('page-2');
    secondListUrl.searchParams.delete('pageToken');
    expect(secondListUrl.search).toBe(firstListUrl.search);
  });

  it('adds only the durable sync token to the same base query for incremental pulls', async () => {
    const requests: CapturedRequest[] = [];
    const responses = [
      new Response(JSON.stringify({ access_token: 'fresh-access-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      new Response(JSON.stringify({ items: [], nextSyncToken: 'sync-token-next' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ];
    const fetchImpl = vi.fn((input: FetchInput, init?: FetchInit) => {
      requests.push({ url: requestUrl(input), init });
      const response = responses.shift();
      return response
        ? Promise.resolve(response)
        : Promise.reject(new Error('Unexpected provider request'));
    });
    const provider = createProvider(fetchImpl);

    await expect(provider.pullChanges(connectionId)).resolves.toEqual({
      changes: [],
      cursor: 'sync-token-next',
    });

    const listUrl = new URL(requestAt(requests, 1).url);
    expect(listUrl.searchParams.get('syncToken')).toBe('sync-token-previous');
    expect(listUrl.searchParams.get('showDeleted')).toBe('true');
    expect(listUrl.searchParams.get('singleEvents')).toBe('false');
    expect(listUrl.searchParams.get('maxResults')).toBe('250');
    expect(listUrl.searchParams.has('timeMin')).toBe(false);
    expect(listUrl.searchParams.has('updatedMin')).toBe(false);
  });

  it('maps Google HTTP 410 to the provider-neutral invalid cursor error', async () => {
    const responses = [
      new Response(JSON.stringify({ access_token: 'fresh-access-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      new Response(null, { status: 410 }),
    ];
    const fetchImpl = vi.fn(() => {
      const response = responses.shift();
      return response
        ? Promise.resolve(response)
        : Promise.reject(new Error('Unexpected provider request'));
    });
    const provider = createProvider(fetchImpl);

    let error: unknown;
    try {
      await provider.pullChanges(connectionId);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ExternalCalendarAdapterError);
    expect((error as ExternalCalendarAdapterError).code).toBe('invalid_sync_cursor');
  });

  it('normalizes creates through the command boundary without putting credentials in URLs', async () => {
    const requests: CapturedRequest[] = [];
    const responses = [
      new Response(JSON.stringify({ access_token: 'fresh-access-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      new Response(JSON.stringify({ id: 'created-event-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ];
    const fetchImpl = vi.fn((input: FetchInput, init?: FetchInit) => {
      requests.push({ url: requestUrl(input), init });
      const response = responses.shift();
      return response
        ? Promise.resolve(response)
        : Promise.reject(new Error('Unexpected provider request'));
    });
    const provider = createProvider(fetchImpl);
    const command: CalendarCommand = {
      commandId,
      connectionId,
      operation: 'create',
      event: {
        title: 'Local mission',
        schedule: {
          type: 'timed',
          startInstant: '2026-09-15T01:00:00.000Z',
          finishInstant: '2026-09-15T02:00:00.000Z',
          timeZone: 'Asia/Hong_Kong',
          timeBehavior: 'fixed_instant',
        },
        recurrence: null,
        location: 'Central',
        providerNotes: 'Provider note',
      },
    };

    await expect(provider.applyCommands([command])).resolves.toEqual([
      { commandId, status: 'applied', providerEventId: 'created-event-1' },
    ]);

    const createRequest = requestAt(requests, 1);
    expect(createRequest.url).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/calendar-1/events',
    );
    expect(createRequest.url).not.toContain('refresh-secret');
    expect(createRequest.init?.headers).toMatchObject({
      Authorization: 'Bearer fresh-access-token',
    });
    expect(JSON.parse(requestBody(createRequest.init))).toEqual({
      summary: 'Local mission',
      description: 'Provider note',
      location: 'Central',
      start: { dateTime: '2026-09-15T01:00:00.000Z', timeZone: 'Asia/Hong_Kong' },
      end: { dateTime: '2026-09-15T02:00:00.000Z', timeZone: 'Asia/Hong_Kong' },
    });
  });
});
