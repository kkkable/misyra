import type { GoogleCalendarOAuthGateway } from './google-calendar-connection.js';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOCATION_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const CALENDARS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const REQUEST_TIMEOUT_MS = 10_000;

type GoogleCalendarOAuthGatewayOptions = Readonly<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}>;

function providerFailure(cause?: unknown): Error {
  return cause === undefined
    ? new Error('google_calendar_provider_request_failed')
    : new Error('google_calendar_provider_request_failed', { cause });
}

async function providerFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw providerFailure();
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'google_calendar_provider_request_failed') {
      throw error;
    }
    throw providerFailure(error);
  }
}

async function providerJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await providerFetch(fetchImpl, url, init);
  try {
    return await response.json();
  } catch (error) {
    throw providerFailure(error);
  }
}

function requiredProviderString(value: unknown, field: string): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !(field in value) ||
    typeof (value as Record<string, unknown>)[field] !== 'string' ||
    (value as Record<string, string>)[field].length === 0
  ) {
    throw providerFailure();
  }
  return (value as Record<string, string>)[field];
}

function formBody(values: Record<string, string>): URLSearchParams {
  return new URLSearchParams(values);
}

export function createGoogleCalendarOAuthGateway(
  options: GoogleCalendarOAuthGatewayOptions,
): GoogleCalendarOAuthGateway {
  const fetchImpl = options.fetchImpl ?? fetch;

  const tokenRequest = (values: Record<string, string>) =>
    providerJson(fetchImpl, TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        ...values,
      }),
    });

  return {
    buildAuthorizationUrl({ state }) {
      const url = new URL(AUTHORIZATION_ENDPOINT);
      url.search = formBody({
        client_id: options.clientId,
        redirect_uri: options.redirectUri,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        scope: CALENDAR_SCOPE,
        state,
      }).toString();
      return url.toString();
    },

    async exchangeCode(code) {
      const body = await tokenRequest({
        code,
        redirect_uri: options.redirectUri,
        grant_type: 'authorization_code',
      });
      return { refreshToken: requiredProviderString(body, 'refresh_token') };
    },

    async createDedicatedCalendar(refreshToken) {
      const refreshed = await tokenRequest({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });
      const accessToken = requiredProviderString(refreshed, 'access_token');
      const created = await providerJson(fetchImpl, CALENDARS_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ summary: 'Misyra' }),
      });
      return requiredProviderString(created, 'id');
    },

    async revokeRefreshToken(refreshToken) {
      await providerFetch(fetchImpl, REVOCATION_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: formBody({ token: refreshToken }),
      });
    },
  };
}
