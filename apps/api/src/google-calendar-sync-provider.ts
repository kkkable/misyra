import {
  ExternalCalendarAdapterError,
  synchronizedImportBatchSchema,
  synchronizedProviderChangeBatchSchema,
  synchronizedProviderEventSchema,
  type CalendarCommand,
  type CalendarCommandResult,
  type ExternalCalendarErrorCode,
  type NormalizedCalendarRecurrence,
  type SynchronizedImportBatch,
  type SynchronizedProviderChange,
  type SynchronizedProviderChangeBatch,
  type SynchronizedProviderEvent,
} from '@misyra/contracts';

import type { GoogleCalendarSynchronizationProvider } from './google-calendar-sync.js';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_PAGES = 20;
const PAGE_SIZE = '250';
const GOOGLE_WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

type GoogleCalendarSyncSession = Readonly<{
  providerCalendarId: string;
  refreshToken: string;
  cursor: string | null;
  timeZone?: string;
}>;

type GoogleCalendarSyncProviderOptions = Readonly<{
  clientId: string;
  clientSecret: string;
  loadSession: (connectionId: string) => Promise<GoogleCalendarSyncSession | null>;
  fetchImpl?: typeof fetch;
  maxPages?: number;
}>;

type GoogleProviderContext = Readonly<{
  session: GoogleCalendarSyncSession;
  accessToken: string;
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  const record = asRecord(value);
  const candidate = record?.[field];
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new ExternalCalendarAdapterError('unknown', 'google_calendar_payload_invalid');
  }
  return candidate;
}

function optionalString(value: unknown, field: string): string | null {
  const record = asRecord(value);
  const candidate = record?.[field];
  return typeof candidate === 'string' ? candidate : null;
}

function optionalRecord(value: unknown, field: string): Record<string, unknown> | null {
  const record = asRecord(value);
  return asRecord(record?.[field]);
}

function optionalArray(value: unknown, field: string): readonly unknown[] {
  const record = asRecord(value);
  const candidate = record?.[field];
  return Array.isArray(candidate) ? candidate : [];
}

function mapHttpError(status: number): ExternalCalendarErrorCode {
  if (status === 401) return 'authentication_required';
  if (status === 403) return 'permission_denied';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'provider_unavailable';
  return 'unknown';
}

async function providerResponse(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  options: Readonly<{ invalidCursorOnGone?: boolean }> = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ExternalCalendarAdapterError(
      'provider_unavailable',
      'google_calendar_request_failed',
    );
  }

  if (options.invalidCursorOnGone === true && response.status === 410) {
    throw new ExternalCalendarAdapterError('invalid_sync_cursor', 'invalid_sync_cursor');
  }
  if (!response.ok) {
    throw new ExternalCalendarAdapterError(
      mapHttpError(response.status),
      'google_calendar_request_failed',
    );
  }
  return response;
}

async function providerJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  options?: Readonly<{ invalidCursorOnGone?: boolean }>,
): Promise<unknown> {
  const response = await providerResponse(fetchImpl, url, init, options);
  try {
    return await response.json();
  } catch {
    throw new ExternalCalendarAdapterError('unknown', 'google_calendar_payload_invalid');
  }
}

function formBody(values: Readonly<Record<string, string>>): URLSearchParams {
  return new URLSearchParams(values);
}

async function refreshAccessToken(
  fetchImpl: typeof fetch,
  options: GoogleCalendarSyncProviderOptions,
  refreshToken: string,
): Promise<string> {
  const payload = await providerJson(fetchImpl, TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  return requiredString(payload, 'access_token');
}

function eventsEndpoint(calendarId: string): string {
  return `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
}

function eventEndpoint(calendarId: string, eventId: string): string {
  return `${eventsEndpoint(calendarId)}/${encodeURIComponent(eventId)}`;
}

function googleListUrl(
  calendarId: string,
  input: Readonly<{ syncToken?: string; pageToken?: string }>,
): string {
  const url = new URL(eventsEndpoint(calendarId));
  url.searchParams.set('showDeleted', 'true');
  url.searchParams.set('singleEvents', 'false');
  url.searchParams.set('maxResults', PAGE_SIZE);
  if (input.syncToken !== undefined) url.searchParams.set('syncToken', input.syncToken);
  if (input.pageToken !== undefined) url.searchParams.set('pageToken', input.pageToken);
  return url.toString();
}

function toIsoInstant(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ExternalCalendarAdapterError('unknown', 'google_calendar_payload_invalid');
  }
  return date.toISOString();
}

function googleDateToLocalDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ExternalCalendarAdapterError('unknown', 'google_calendar_payload_invalid');
  }
  return value;
}

function parseRecurrenceEnd(
  parts: Readonly<Record<string, string>>,
): NormalizedCalendarRecurrence['end'] {
  const count = parts.COUNT;
  if (count !== undefined) {
    const occurrenceCount = Number.parseInt(count, 10);
    if (Number.isInteger(occurrenceCount) && occurrenceCount > 0) {
      return { type: 'count', occurrenceCount };
    }
  }
  const until = parts.UNTIL;
  if (until !== undefined && /^\d{8}/.test(until)) {
    return {
      type: 'date',
      inclusiveLocalDate: `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`,
    };
  }
  return { type: 'never' };
}

function weekdayIndex(value: string | undefined, fallback: number): number {
  const index =
    value === undefined ? -1 : GOOGLE_WEEKDAYS.indexOf(value as (typeof GOOGLE_WEEKDAYS)[number]);
  return index >= 0 ? index : fallback;
}

function parseOrdinalWeekday(
  value: string,
): Readonly<{ ordinal: 1 | 2 | 3 | 4 | -1; weekday: number }> | null {
  const match = /^(-1|[1-4])(SU|MO|TU|WE|TH|FR|SA)$/.exec(value);
  if (!match) return null;
  const ordinal = Number.parseInt(match[1] ?? '', 10);
  if (ordinal !== -1 && ordinal !== 1 && ordinal !== 2 && ordinal !== 3 && ordinal !== 4)
    return null;
  return { ordinal, weekday: weekdayIndex(match[2], 0) };
}

function parseGoogleRecurrence(value: unknown): NormalizedCalendarRecurrence | null {
  const recurrence = optionalArray(value, 'recurrence');
  const rrule = recurrence.find((entry) => typeof entry === 'string' && entry.startsWith('RRULE:'));
  if (typeof rrule !== 'string') return null;

  const parts: Record<string, string> = {};
  for (const component of rrule.slice('RRULE:'.length).split(';')) {
    const separator = component.indexOf('=');
    if (separator <= 0) continue;
    parts[component.slice(0, separator)] = component.slice(separator + 1);
  }

  const interval = Math.max(1, Number.parseInt(parts.INTERVAL ?? '1', 10) || 1);
  const end = parseRecurrenceEnd(parts);
  switch (parts.FREQ) {
    case 'DAILY':
      return { pattern: { type: 'daily', interval }, end };
    case 'WEEKLY': {
      const weekdays = (parts.BYDAY ?? '')
        .split(',')
        .map((day) => weekdayIndex(day, -1))
        .filter((day) => day >= 0);
      if (weekdays.length === 0) return null;
      return {
        pattern: {
          type: 'weekly',
          interval,
          weekdays,
          weekStartsOn: weekdayIndex(parts.WKST, 1),
        },
        end,
      };
    }
    case 'MONTHLY': {
      const dayOfMonth = Number.parseInt(parts.BYMONTHDAY ?? '', 10);
      if (Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31) {
        return { pattern: { type: 'monthly-date', interval, dayOfMonth }, end };
      }
      const ordinal = parseOrdinalWeekday(parts.BYDAY ?? '');
      return ordinal === null
        ? null
        : {
            pattern: { type: 'monthly-ordinal', interval, ...ordinal },
            end,
          };
    }
    case 'YEARLY': {
      const month = Number.parseInt(parts.BYMONTH ?? '', 10);
      if (!Number.isInteger(month) || month < 1 || month > 12) return null;
      const dayOfMonth = Number.parseInt(parts.BYMONTHDAY ?? '', 10);
      if (Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31) {
        return { pattern: { type: 'yearly-date', interval, month, day: dayOfMonth }, end };
      }
      const ordinal = parseOrdinalWeekday(parts.BYDAY ?? '');
      return ordinal === null
        ? null
        : {
            pattern: { type: 'yearly-ordinal', interval, month, ...ordinal },
            end,
          };
    }
    default:
      return null;
  }
}

function normalizeSchedule(value: unknown, fallbackTimeZone: string) {
  const start = optionalRecord(value, 'start');
  const end = optionalRecord(value, 'end');
  if (start === null || end === null) {
    throw new ExternalCalendarAdapterError('unknown', 'google_calendar_payload_invalid');
  }

  const startDateTime = typeof start.dateTime === 'string' ? start.dateTime : null;
  const finishDateTime = typeof end.dateTime === 'string' ? end.dateTime : null;
  if (startDateTime !== null && finishDateTime !== null) {
    const timeZone =
      (typeof start.timeZone === 'string' && start.timeZone.length > 0 ? start.timeZone : null) ??
      (typeof end.timeZone === 'string' && end.timeZone.length > 0 ? end.timeZone : null) ??
      fallbackTimeZone;
    return {
      type: 'timed' as const,
      startInstant: toIsoInstant(startDateTime),
      finishInstant: toIsoInstant(finishDateTime),
      timeZone,
      timeBehavior: 'fixed_instant' as const,
    };
  }

  const startDate = typeof start.date === 'string' ? start.date : null;
  const endDate = typeof end.date === 'string' ? end.date : null;
  if (startDate === null || endDate === null) {
    throw new ExternalCalendarAdapterError('unknown', 'google_calendar_payload_invalid');
  }
  return {
    type: 'all_day' as const,
    startLocalDate: googleDateToLocalDate(startDate),
    endLocalDateExclusive: googleDateToLocalDate(endDate),
    timeZone: fallbackTimeZone,
  };
}

function normalizeEvent(
  raw: unknown,
  calendarId: string,
  fallbackTimeZone: string,
): SynchronizedProviderEvent {
  const organizer = optionalRecord(raw, 'organizer');
  const normalized = {
    providerCalendarId: calendarId,
    providerEventId: requiredString(raw, 'id'),
    providerUpdatedAt: toIsoInstant(requiredString(raw, 'updated')),
    title: optionalString(raw, 'summary'),
    schedule: normalizeSchedule(raw, fallbackTimeZone),
    recurrence: parseGoogleRecurrence(raw),
    location: optionalString(raw, 'location'),
    providerNotes: optionalString(raw, 'description'),
    status: 'confirmed' as const,
    ownership:
      organizer?.self === true ? ('app_owned' as const) : ('organizer_controlled' as const),
  };

  const parsed = synchronizedProviderEventSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new ExternalCalendarAdapterError('unknown', 'google_calendar_payload_invalid');
  }
  return parsed.data;
}

function recurrenceScopeForDeleted(raw: unknown): 'this_occurrence' | 'entire_series' {
  return optionalString(raw, 'recurringEventId') === null ? 'entire_series' : 'this_occurrence';
}

function normalizeIncrementalItem(
  raw: unknown,
  calendarId: string,
  fallbackTimeZone: string,
): SynchronizedProviderChange {
  if (optionalString(raw, 'status') === 'cancelled') {
    return {
      type: 'delete',
      providerEventId: requiredString(raw, 'id'),
      providerUpdatedAt: toIsoInstant(requiredString(raw, 'updated')),
      recurrenceScope: recurrenceScopeForDeleted(raw),
    };
  }
  return { type: 'upsert', event: normalizeEvent(raw, calendarId, fallbackTimeZone) };
}

function parseListPage(value: unknown): Readonly<{
  items: readonly unknown[];
  nextPageToken: string | null;
  nextSyncToken: string | null;
}> {
  return {
    items: optionalArray(value, 'items'),
    nextPageToken: optionalString(value, 'nextPageToken'),
    nextSyncToken: optionalString(value, 'nextSyncToken'),
  };
}

function weekdayCode(weekday: number): string {
  return GOOGLE_WEEKDAYS[weekday] ?? 'SU';
}

function serializeRecurrenceEnd(end: NormalizedCalendarRecurrence['end']): string[] {
  if (end.type === 'never') return [];
  if (end.type === 'count') return [`COUNT=${String(end.occurrenceCount)}`];
  return [`UNTIL=${end.inclusiveLocalDate.replaceAll('-', '')}T235959Z`];
}

function serializeGoogleRecurrence(recurrence: NormalizedCalendarRecurrence): string {
  const { pattern } = recurrence;
  const components: string[] = [];
  switch (pattern.type) {
    case 'daily':
      components.push('FREQ=DAILY', `INTERVAL=${String(pattern.interval)}`);
      break;
    case 'weekly':
      components.push(
        'FREQ=WEEKLY',
        `INTERVAL=${String(pattern.interval)}`,
        `BYDAY=${pattern.weekdays.map(weekdayCode).join(',')}`,
        `WKST=${weekdayCode(pattern.weekStartsOn)}`,
      );
      break;
    case 'monthly-date':
      components.push(
        'FREQ=MONTHLY',
        `INTERVAL=${String(pattern.interval)}`,
        `BYMONTHDAY=${String(pattern.dayOfMonth)}`,
      );
      break;
    case 'monthly-ordinal':
      components.push(
        'FREQ=MONTHLY',
        `INTERVAL=${String(pattern.interval)}`,
        `BYDAY=${String(pattern.ordinal)}${weekdayCode(pattern.weekday)}`,
      );
      break;
    case 'yearly-date':
      components.push(
        'FREQ=YEARLY',
        `INTERVAL=${String(pattern.interval)}`,
        `BYMONTH=${String(pattern.month)}`,
        `BYMONTHDAY=${String(pattern.day)}`,
      );
      break;
    case 'yearly-ordinal':
      components.push(
        'FREQ=YEARLY',
        `INTERVAL=${String(pattern.interval)}`,
        `BYMONTH=${String(pattern.month)}`,
        `BYDAY=${String(pattern.ordinal)}${weekdayCode(pattern.weekday)}`,
      );
      break;
  }
  components.push(...serializeRecurrenceEnd(recurrence.end));
  return `RRULE:${components.join(';')}`;
}

function writableEventBody(event: Extract<CalendarCommand, { operation: 'create' }>['event']) {
  const body: Record<string, unknown> = {
    summary: event.title,
  };
  if (event.providerNotes !== null) body.description = event.providerNotes;
  if (event.location !== null) body.location = event.location;
  if (event.schedule.type === 'timed') {
    body.start = { dateTime: event.schedule.startInstant, timeZone: event.schedule.timeZone };
    body.end = { dateTime: event.schedule.finishInstant, timeZone: event.schedule.timeZone };
  } else {
    body.start = { date: event.schedule.startLocalDate };
    body.end = { date: event.schedule.endLocalDateExclusive };
  }
  if (event.recurrence !== null) body.recurrence = [serializeGoogleRecurrence(event.recurrence)];
  return body;
}

function writablePatchBody(patch: Extract<CalendarCommand, { operation: 'update' }>['patch']) {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.summary = patch.title;
  if (patch.providerNotes !== undefined) body.description = patch.providerNotes;
  if (patch.location !== undefined) body.location = patch.location;
  if (patch.schedule !== undefined) {
    if (patch.schedule.type === 'timed') {
      body.start = { dateTime: patch.schedule.startInstant, timeZone: patch.schedule.timeZone };
      body.end = { dateTime: patch.schedule.finishInstant, timeZone: patch.schedule.timeZone };
    } else {
      body.start = { date: patch.schedule.startLocalDate };
      body.end = { date: patch.schedule.endLocalDateExclusive };
    }
  }
  if (patch.recurrence !== undefined) {
    body.recurrence =
      patch.recurrence === null ? [] : [serializeGoogleRecurrence(patch.recurrence)];
  }
  return body;
}

async function requireSession(
  options: GoogleCalendarSyncProviderOptions,
  connectionId: string,
): Promise<GoogleCalendarSyncSession> {
  const session = await options.loadSession(connectionId);
  if (
    session === null ||
    session.providerCalendarId.length === 0 ||
    session.refreshToken.length === 0
  ) {
    throw new ExternalCalendarAdapterError('authentication_required', 'calendar_not_connected');
  }
  return session;
}

async function contextForConnection(
  fetchImpl: typeof fetch,
  options: GoogleCalendarSyncProviderOptions,
  connectionId: string,
): Promise<GoogleProviderContext> {
  const session = await requireSession(options, connectionId);
  return {
    session,
    accessToken: await refreshAccessToken(fetchImpl, options, session.refreshToken),
  };
}

async function listGoogleEvents(
  fetchImpl: typeof fetch,
  context: GoogleProviderContext,
  maxPages: number,
  syncToken?: string,
): Promise<Readonly<{ items: readonly unknown[]; cursor: string }>> {
  const items: unknown[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const listInput = {
      ...(syncToken === undefined ? {} : { syncToken }),
      ...(pageToken === undefined ? {} : { pageToken }),
    };
    const payload = await providerJson(
      fetchImpl,
      googleListUrl(context.session.providerCalendarId, listInput),
      { headers: { Authorization: `Bearer ${context.accessToken}` } },
      { invalidCursorOnGone: syncToken !== undefined },
    );
    const parsed = parseListPage(payload);
    items.push(...parsed.items);

    if (parsed.nextPageToken === null) {
      if (parsed.nextSyncToken === null) {
        throw new ExternalCalendarAdapterError('unknown', 'google_calendar_sync_token_missing');
      }
      return { items, cursor: parsed.nextSyncToken };
    }
    if (seenPageTokens.has(parsed.nextPageToken)) {
      throw new ExternalCalendarAdapterError('provider_unavailable', 'google_calendar_page_loop');
    }
    seenPageTokens.add(parsed.nextPageToken);
    pageToken = parsed.nextPageToken;
  }

  throw new ExternalCalendarAdapterError('provider_unavailable', 'google_calendar_page_limit');
}

async function applyCommand(
  fetchImpl: typeof fetch,
  context: GoogleProviderContext,
  command: CalendarCommand,
): Promise<CalendarCommandResult> {
  try {
    if (command.operation === 'create') {
      const payload = await providerJson(
        fetchImpl,
        eventsEndpoint(context.session.providerCalendarId),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${context.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(writableEventBody(command.event)),
        },
      );
      return {
        commandId: command.commandId,
        status: 'applied',
        providerEventId: requiredString(payload, 'id'),
      };
    }

    if (command.recurrenceScope === 'this_and_future') {
      return { commandId: command.commandId, status: 'failed', errorCode: 'unsupported' };
    }

    if (command.operation === 'update') {
      await providerResponse(
        fetchImpl,
        eventEndpoint(context.session.providerCalendarId, command.providerEventId),
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${context.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(writablePatchBody(command.patch)),
        },
      );
      return {
        commandId: command.commandId,
        status: 'applied',
        providerEventId: command.providerEventId,
      };
    }

    await providerResponse(
      fetchImpl,
      eventEndpoint(context.session.providerCalendarId, command.providerEventId),
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${context.accessToken}` },
      },
    );
    return {
      commandId: command.commandId,
      status: 'applied',
      providerEventId: command.providerEventId,
    };
  } catch (error) {
    return {
      commandId: command.commandId,
      status: 'failed',
      errorCode: error instanceof ExternalCalendarAdapterError ? error.code : 'unknown',
    };
  }
}

export function createGoogleCalendarSyncProvider(
  options: GoogleCalendarSyncProviderOptions,
): GoogleCalendarSynchronizationProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  if (!Number.isInteger(maxPages) || maxPages <= 0) {
    throw new Error('google_calendar_max_pages_invalid');
  }

  return Object.freeze({
    async initialImport(connectionId: string): Promise<SynchronizedImportBatch> {
      const context = await contextForConnection(fetchImpl, options, connectionId);
      const listed = await listGoogleEvents(fetchImpl, context, maxPages);
      const events = listed.items
        .filter((item) => optionalString(item, 'status') !== 'cancelled')
        .map((item) =>
          normalizeEvent(
            item,
            context.session.providerCalendarId,
            context.session.timeZone ?? 'UTC',
          ),
        );
      return synchronizedImportBatchSchema.parse({ events, cursor: listed.cursor });
    },

    async pullChanges(connectionId: string): Promise<SynchronizedProviderChangeBatch> {
      const context = await contextForConnection(fetchImpl, options, connectionId);
      if (context.session.cursor === null) {
        throw new ExternalCalendarAdapterError('invalid_sync_cursor', 'invalid_sync_cursor');
      }
      const listed = await listGoogleEvents(fetchImpl, context, maxPages, context.session.cursor);
      const changes = listed.items.map((item) =>
        normalizeIncrementalItem(
          item,
          context.session.providerCalendarId,
          context.session.timeZone ?? 'UTC',
        ),
      );
      return synchronizedProviderChangeBatchSchema.parse({ changes, cursor: listed.cursor });
    },

    async applyCommands(
      commands: readonly CalendarCommand[],
    ): Promise<readonly CalendarCommandResult[]> {
      const contextByConnection = new Map<string, Promise<GoogleProviderContext>>();
      const context = (connectionId: string) => {
        const existing = contextByConnection.get(connectionId);
        if (existing !== undefined) return existing;
        const created = contextForConnection(fetchImpl, options, connectionId);
        contextByConnection.set(connectionId, created);
        return created;
      };

      return Promise.all(
        commands.map(async (command) =>
          applyCommand(fetchImpl, await context(command.connectionId), command),
        ),
      );
    },
  });
}
