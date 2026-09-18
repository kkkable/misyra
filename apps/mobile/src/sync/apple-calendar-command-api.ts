import {
  apiResponseEnvelopeSchema,
  calendarCommandResultSchema,
  calendarCommandSchema,
  uuidSchema,
  type CalendarCommand,
  type CalendarCommandResult,
} from '@misyra/contracts';

export type AppleCalendarRemoteCommandClaim = Readonly<{
  claimToken: string;
  occurrenceId: string;
  providerCalendarId: string;
  command: CalendarCommand;
}>;

type FetchResponse = Readonly<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

type FetchInit = Readonly<{
  method: 'POST';
  headers: Readonly<{
    authorization: string;
    'content-type'?: string;
  }>;
  body?: string;
}>;

type Fetcher = (url: string, init: FetchInit) => Promise<FetchResponse>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function payloadFromEnvelope(value: unknown): unknown {
  if (!isRecord(value) || value.ok !== true || !Object.hasOwn(value, 'payload')) {
    throw new Error('apple_calendar_command_request_failed');
  }
  return value.payload;
}

function parseClaim(value: unknown): AppleCalendarRemoteCommandClaim | null {
  if (!isRecord(value) || !Object.hasOwn(value, 'claim')) {
    throw new Error('apple_calendar_command_claim_invalid');
  }
  if (value.claim === null) return null;
  if (!isRecord(value.claim)) throw new Error('apple_calendar_command_claim_invalid');
  const claimToken = uuidSchema.safeParse(value.claim.claimToken);
  const occurrenceId = uuidSchema.safeParse(value.claim.occurrenceId);
  const command = calendarCommandSchema.safeParse(value.claim.command);
  if (
    !claimToken.success ||
    !occurrenceId.success ||
    !command.success ||
    typeof value.claim.providerCalendarId !== 'string' ||
    value.claim.providerCalendarId.length === 0
  ) {
    throw new Error('apple_calendar_command_claim_invalid');
  }
  return {
    claimToken: claimToken.data,
    occurrenceId: occurrenceId.data,
    providerCalendarId: value.claim.providerCalendarId,
    command: command.data,
  };
}

export function createAppleCalendarCommandApi({
  baseUrl,
  accessToken,
  fetcher = fetch,
}: Readonly<{
  baseUrl: string;
  accessToken: string;
  fetcher?: Fetcher;
}>) {
  if (accessToken.length === 0) throw new TypeError('Access token must not be empty.');
  const root = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  async function request(path: string, body?: unknown): Promise<unknown> {
    const hasBody = body !== undefined;
    const response = await fetcher(`${root}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
    });
    const responseBody = await response.json();
    if (!response.ok) {
      const envelope = apiResponseEnvelopeSchema.safeParse(responseBody);
      if (envelope.success && !envelope.data.ok && envelope.data.error !== undefined) {
        throw new Error(envelope.data.error.code);
      }
      throw new Error('apple_calendar_command_request_failed');
    }
    return payloadFromEnvelope(responseBody);
  }

  return Object.freeze({
    async claim(): Promise<AppleCalendarRemoteCommandClaim | null> {
      return parseClaim(await request('/v1/sync/apple-calendar/commands/claim'));
    },
    async settle(claimToken: string, result: CalendarCommandResult): Promise<void> {
      const token = uuidSchema.parse(claimToken);
      const parsedResult = calendarCommandResultSchema.parse(result);
      const payload = await request('/v1/sync/apple-calendar/commands/settle', {
        claimToken: token,
        result: parsedResult,
      });
      if (!isRecord(payload) || payload.settled !== true) {
        throw new Error('apple_calendar_command_settlement_invalid');
      }
    },
  });
}

export type AppleCalendarCommandApi = ReturnType<typeof createAppleCalendarCommandApi>;
