const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const REQUEST_TIMEOUT_MS = 10_000;

type GoogleCalendarWatchSession = Readonly<{
  providerCalendarId: string;
  refreshToken: string;
}>;

type GoogleCalendarWatchProviderOptions = Readonly<{
  clientId: string;
  clientSecret: string;
  loadSession: (connectionId: string) => Promise<GoogleCalendarWatchSession | null>;
  fetchImpl?: typeof fetch;
}>;

type WatchRequest = Readonly<{
  connectionId: string;
  channelId: string;
  channelToken: string;
  webhookAddress: string;
}>;

type WatchResponse = Readonly<{
  resourceId: string;
  expiresAt: Date;
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  const candidate = asRecord(value)?.[field];
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new Error('google_calendar_watch_payload_invalid');
  }
  return candidate;
}

async function providerJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error('google_calendar_watch_provider_unavailable');
  }
  if (!response.ok) throw new Error('google_calendar_watch_provider_unavailable');
  try {
    return await response.json();
  } catch {
    throw new Error('google_calendar_watch_payload_invalid');
  }
}

async function refreshAccessToken(
  fetchImpl: typeof fetch,
  options: GoogleCalendarWatchProviderOptions,
  refreshToken: string,
): Promise<string> {
  const payload = await providerJson(fetchImpl, TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  return requiredString(payload, 'access_token');
}

function parseExpiration(value: unknown): Date {
  const expiration = requiredString(value, 'expiration');
  if (!/^\d+$/.test(expiration)) throw new Error('google_calendar_watch_payload_invalid');
  const expiresAt = new Date(Number(expiration));
  if (Number.isNaN(expiresAt.getTime())) throw new Error('google_calendar_watch_payload_invalid');
  return expiresAt;
}

export function createGoogleCalendarWatchProvider(options: GoogleCalendarWatchProviderOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return Object.freeze({
    async watchEvents(input: WatchRequest): Promise<WatchResponse> {
      const session = await options.loadSession(input.connectionId);
      if (session === null) throw new Error('google_calendar_watch_connection_not_found');
      const accessToken = await refreshAccessToken(fetchImpl, options, session.refreshToken);
      const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(session.providerCalendarId)}/events/watch`;
      const payload = await providerJson(fetchImpl, url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: input.channelId,
          type: 'web_hook',
          address: input.webhookAddress,
          token: input.channelToken,
        }),
      });
      return {
        resourceId: requiredString(payload, 'resourceId'),
        expiresAt: parseExpiration(payload),
      };
    },
  });
}
