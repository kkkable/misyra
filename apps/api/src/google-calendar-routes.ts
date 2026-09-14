import {
  calendarConnectionSchema,
  disconnectCalendarRequestSchema,
  externalCalendarRecurrenceScopeSchema,
  googleCalendarCallbackQuerySchema,
  googleCalendarConnectRequestSchema,
  uuidSchema,
} from '@misyra/contracts';

import {
  GoogleCalendarOAuthError,
  type GoogleCalendarConnectionService,
} from './google-calendar-connection.js';
import { GoogleCalendarHiddenEventError } from './google-calendar-hidden-events.js';
import type { GoogleCalendarSyncService } from './google-calendar-sync.js';
import type { GoogleCalendarWatchService } from './google-calendar-watch.js';
import { ApiError, type ApiRouteDefinition } from './index.js';

export type GoogleCalendarRouteService = Pick<
  GoogleCalendarConnectionService,
  'startOAuth' | 'completeOAuth' | 'disconnect'
>;

export type GoogleCalendarRouteSyncService = Pick<GoogleCalendarSyncService, 'initialSync'>;
export type GoogleCalendarRouteWatchService = Pick<
  GoogleCalendarWatchService,
  'handleWebhook' | 'ensureChannel'
>;

export type GoogleCalendarHiddenEventRouteService = Readonly<{
  listHiddenEvents(accountId: string): Promise<readonly unknown[]>;
  restoreHiddenEvent(
    accountId: string,
    hiddenId: string,
    recurrenceScope: 'this_occurrence' | 'this_and_future' | 'entire_series',
  ): Promise<Readonly<{ occurrenceId: string }>>;
}>;

function validationFailed(): never {
  throw new ApiError('validation_failed');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseConnectBody(value: unknown) {
  const parsed = googleCalendarConnectRequestSchema.safeParse(value);
  return parsed.success ? parsed.data : validationFailed();
}

function parseCallbackQuery(value: unknown) {
  const parsed = googleCalendarCallbackQuerySchema.safeParse(value);
  return parsed.success ? parsed.data : validationFailed();
}

function parseDisconnectBody(value: unknown) {
  const parsed = disconnectCalendarRequestSchema.safeParse(value);
  return parsed.success ? parsed.data : validationFailed();
}

function parseHiddenEventId(value: unknown): string {
  if (!isRecord(value)) return validationFailed();
  const parsed = uuidSchema.safeParse(value.hiddenId);
  return parsed.success ? parsed.data : validationFailed();
}

function parseRestoreBody(
  value: unknown,
): 'this_occurrence' | 'this_and_future' | 'entire_series' {
  if (!isRecord(value) || Object.keys(value).length !== 1) return validationFailed();
  const parsed = externalCalendarRecurrenceScopeSchema.safeParse(value.recurrenceScope);
  return parsed.success ? parsed.data : validationFailed();
}

function mapGoogleCalendarError(error: unknown): never {
  if (error instanceof GoogleCalendarOAuthError) {
    switch (error.code) {
      case 'invalid_state':
        throw new ApiError('validation_failed');
      case 'connection_exists':
        throw new ApiError('conflict');
      case 'not_found':
        throw new ApiError('not_found');
      case 'provider_error':
        throw new ApiError('temporarily_unavailable');
    }
  }
  throw error;
}

async function runGoogleCalendarOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return mapGoogleCalendarError(error);
  }
}

async function runHiddenEventOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof GoogleCalendarHiddenEventError) {
      if (error.code === 'not_found') throw new ApiError('not_found');
      throw new ApiError('temporarily_unavailable');
    }
    throw error;
  }
}

function header(
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  name: string,
): string {
  const value = headers[name];
  return typeof value === 'string' ? value : '';
}

export function createGoogleCalendarRoutes(
  service: GoogleCalendarRouteService,
  syncService?: GoogleCalendarRouteSyncService,
  watchService?: GoogleCalendarRouteWatchService,
  hiddenEventService?: GoogleCalendarHiddenEventRouteService,
): ApiRouteDefinition[] {
  const routes: ApiRouteDefinition[] = [
    {
      method: 'POST',
      path: '/calendars/google/connect',
      handler: (request, _reply, auth) => {
        const body = parseConnectBody(request.body);
        return runGoogleCalendarOperation(() => service.startOAuth(auth.accountId, body));
      },
    },
    {
      method: 'GET',
      path: '/calendars/google/callback',
      public: true,
      handler: async (request) => {
        const query = parseCallbackQuery(request.query);
        const connection = await runGoogleCalendarOperation(() => service.completeOAuth(query));
        await syncService?.initialSync(connection.id);
        try {
          await watchService?.ensureChannel(connection.id);
        } catch {
          // The durable watch-maintenance loop repairs connected calendars that lack a channel.
        }
        return calendarConnectionSchema.parse({
          id: connection.id,
          provider: connection.provider,
          providerCalendarId: connection.providerCalendarId,
          initialSyncDirection: connection.initialSyncDirection,
          state: connection.state,
        });
      },
    },
    {
      method: 'POST',
      path: '/calendars/disconnect',
      handler: async (request, _reply, auth) => {
        const body = parseDisconnectBody(request.body);
        await runGoogleCalendarOperation(() =>
          service.disconnect(auth.accountId, body.connectionId),
        );
        return { disconnected: true as const };
      },
    },
  ];

  if (hiddenEventService !== undefined) {
    routes.push(
      {
        method: 'GET',
        path: '/calendars/hidden-events',
        handler: (_request, _reply, auth) =>
          runHiddenEventOperation(() => hiddenEventService.listHiddenEvents(auth.accountId)),
      },
      {
        method: 'POST',
        path: '/calendars/hidden-events/:hiddenId/restore',
        handler: (request, _reply, auth) => {
          const hiddenId = parseHiddenEventId(request.params);
          const recurrenceScope = parseRestoreBody(request.body);
          return runHiddenEventOperation(() =>
            hiddenEventService.restoreHiddenEvent(auth.accountId, hiddenId, recurrenceScope),
          );
        },
      },
    );
  }

  if (watchService !== undefined) {
    routes.push({
      method: 'POST',
      path: '/webhooks/google-calendar',
      public: true,
      handler: (request) =>
        watchService.handleWebhook({
          channelId: header(request.headers, 'x-goog-channel-id'),
          resourceId: header(request.headers, 'x-goog-resource-id'),
          channelToken: header(request.headers, 'x-goog-channel-token'),
          messageNumber: header(request.headers, 'x-goog-message-number'),
          resourceState: header(request.headers, 'x-goog-resource-state'),
          body: request.body,
        }),
    });
  }

  return routes;
}
