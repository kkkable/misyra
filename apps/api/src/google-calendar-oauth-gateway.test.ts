import { describe, expect, it, vi } from 'vitest';

import { createGoogleCalendarOAuthGateway } from './google-calendar-oauth-gateway.js';

const configuration = {
  clientId: 'google-calendar-client-id',
  clientSecret: 'google-calendar-client-secret',
  redirectUri: 'https://api.example.test/v1/calendars/google/callback',
};

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type CapturedRequest = Readonly<{ input: FetchInput; init: FetchInit }>;

function requestAt(requests: readonly CapturedRequest[], index: number): CapturedRequest {
  const request = requests[index];
  if (!request) throw new Error(`Missing captured request at index ${index}`);
  return request;
}

describe('MTS-069 concrete Google OAuth gateway', () => {
  it('builds offline consent authorization with only the calendar scope and opaque state', () => {
    const gateway = createGoogleCalendarOAuthGateway({
      ...configuration,
      fetchImpl: vi.fn(),
    });

    const url = new URL(gateway.buildAuthorizationUrl({ state: 'opaque-state' }));

    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(configuration.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(configuration.redirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar');
    expect(url.searchParams.get('state')).toBe('opaque-state');
  });

  it('exchanges an authorization code without putting credentials in the URL', async () => {
    const requests: CapturedRequest[] = [];
    const fetchImpl = vi.fn((input: FetchInput, init?: FetchInit) => {
      requests.push({ input, init });
      return Promise.resolve(
        new Response(
          JSON.stringify({ access_token: 'access-secret', refresh_token: 'refresh-secret' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });
    const gateway = createGoogleCalendarOAuthGateway({ ...configuration, fetchImpl });

    await expect(gateway.exchangeCode('provider-code')).resolves.toEqual({
      refreshToken: 'refresh-secret',
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const request = requestAt(requests, 0);
    expect(String(request.input)).toBe('https://oauth2.googleapis.com/token');
    expect(request.init?.method).toBe('POST');
    expect(String(request.init?.body)).toContain('code=provider-code');
    expect(String(request.init?.body)).toContain('client_secret=google-calendar-client-secret');
    expect(String(request.input)).not.toContain('google-calendar-client-secret');
  });

  it('creates the dedicated Misyra calendar by refreshing access inside the provider boundary', async () => {
    const requests: CapturedRequest[] = [];
    const responses = [
      new Response(JSON.stringify({ access_token: 'fresh-access-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      new Response(JSON.stringify({ id: 'misyra-provider-calendar-id' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ];
    const fetchImpl = vi.fn((input: FetchInput, init?: FetchInit) => {
      requests.push({ input, init });
      const response = responses.shift();
      return response
        ? Promise.resolve(response)
        : Promise.reject(new Error('Unexpected provider request'));
    });
    const gateway = createGoogleCalendarOAuthGateway({ ...configuration, fetchImpl });

    await expect(gateway.createDedicatedCalendar('refresh-secret')).resolves.toBe(
      'misyra-provider-calendar-id',
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const refreshRequest = requestAt(requests, 0);
    expect(String(refreshRequest.input)).toBe('https://oauth2.googleapis.com/token');
    expect(String(refreshRequest.init?.body)).toContain('grant_type=refresh_token');
    expect(String(refreshRequest.init?.body)).toContain('refresh_token=refresh-secret');
    const calendarRequest = requestAt(requests, 1);
    expect(String(calendarRequest.input)).toBe('https://www.googleapis.com/calendar/v3/calendars');
    expect(calendarRequest.init?.method).toBe('POST');
    expect(calendarRequest.init?.headers).toMatchObject({
      Authorization: 'Bearer fresh-access-token',
    });
    expect(JSON.parse(String(calendarRequest.init?.body))).toEqual({ summary: 'Misyra' });
  });

  it('revokes the refresh credential through a form body and never through the URL', async () => {
    const requests: CapturedRequest[] = [];
    const fetchImpl = vi.fn((input: FetchInput, init?: FetchInit) => {
      requests.push({ input, init });
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    const gateway = createGoogleCalendarOAuthGateway({ ...configuration, fetchImpl });

    await gateway.revokeRefreshToken('refresh-secret');

    const request = requestAt(requests, 0);
    expect(String(request.input)).toBe('https://oauth2.googleapis.com/revoke');
    expect(request.init?.method).toBe('POST');
    expect(String(request.init?.body)).toBe('token=refresh-secret');
    expect(String(request.input)).not.toContain('refresh-secret');
  });

  it('rejects provider failures with a fixed redacted error', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('provider diagnostic includes refresh-secret', { status: 500 })),
    );
    const gateway = createGoogleCalendarOAuthGateway({ ...configuration, fetchImpl });

    let error: unknown;
    try {
      await gateway.exchangeCode('bad-code');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toBe('Error: google_calendar_provider_request_failed');
    expect(String(error)).not.toContain('refresh-secret');
  });
});
