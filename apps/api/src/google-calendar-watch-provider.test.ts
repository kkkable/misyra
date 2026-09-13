import { describe, expect, it, vi } from 'vitest';

import { createGoogleCalendarWatchProvider } from './google-calendar-watch-provider.js';

const connectionId = '11111111-1111-4111-8111-111111111111';
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type CapturedRequest = Readonly<{ url: string; init: FetchInit }>;

function requestUrl(input: FetchInput): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestAt(requests: readonly CapturedRequest[], index: number): CapturedRequest {
  const request = requests[index];
  if (request === undefined) throw new Error(`missing request ${String(index)}`);
  return request;
}

describe('MTS-071 concrete Google watch provider', () => {
  it('refreshes server credentials and creates an events.watch channel', async () => {
    const requests: CapturedRequest[] = [];
    const responses = [
      new Response(JSON.stringify({ access_token: 'fixture-access-value' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      new Response(
        JSON.stringify({
          resourceId: 'provider-resource-id',
          expiration: '1789372800000',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ];
    const fetchImpl = vi.fn((input: FetchInput, init?: FetchInit) => {
      requests.push({ url: requestUrl(input), init });
      const response = responses.shift();
      return response === undefined
        ? Promise.reject(new Error('unexpected provider request'))
        : Promise.resolve(response);
    });
    const provider = createGoogleCalendarWatchProvider({
      clientId: 'fixture-client-id',
      clientSecret: 'fixture-client-value',
      fetchImpl,
      loadSession: vi.fn().mockResolvedValue({
        providerCalendarId: 'calendar/one',
        refreshToken: 'fixture-refresh-value',
      }),
    });

    await expect(
      provider.watchEvents({
        connectionId,
        channelId: 'channel-1',
        channelToken: 'fixture-channel-value',
        webhookAddress: 'https://example.test/v1/calendars/google/webhook',
      }),
    ).resolves.toEqual({
      resourceId: 'provider-resource-id',
      expiresAt: new Date(1789372800000),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(requestAt(requests, 1).url).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/calendar%2Fone/events/watch',
    );
    expect(requestAt(requests, 1).init?.headers).toMatchObject({
      authorization: 'Bearer fixture-access-value',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(requestAt(requests, 1).init?.body))).toEqual({
      id: 'channel-1',
      type: 'web_hook',
      address: 'https://example.test/v1/calendars/google/webhook',
      token: 'fixture-channel-value',
    });
  });

  it('fails closed when the connection cannot be loaded', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = createGoogleCalendarWatchProvider({
      clientId: 'fixture-client-id',
      clientSecret: 'fixture-client-value',
      fetchImpl,
      loadSession: vi.fn().mockResolvedValue(null),
    });

    await expect(
      provider.watchEvents({
        connectionId,
        channelId: 'channel-1',
        channelToken: 'fixture-channel-value',
        webhookAddress: 'https://example.test/webhook',
      }),
    ).rejects.toThrow('google_calendar_watch_connection_not_found');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
