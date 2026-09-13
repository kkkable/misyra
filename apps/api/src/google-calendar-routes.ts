import {
  calendarConnectionSchema,
  disconnectCalendarRequestSchema,
  googleCalendarCallbackQuerySchema,
  googleCalendarConnectRequestSchema,
} from '@misyra/contracts';

import {
  GoogleCalendarOAuthError,
  type GoogleCalendarConnectionService,
} from './google-calendar-connection.js';
import type { GoogleCalendarSyncService } from './google-calendar-sync.js';
import { ApiError, type ApiRouteDefinition } from './index.js';

export type GoogleCalendarRouteService = Pick<
  GoogleCalendarConnectionService,
  'startOAuth' | 'completeOAuth' | 'disconnect'
>;

export type GoogleCalendarRouteSyncService = Pick<GoogleCalendarSyncService, 'initialSync'>;

function validationFailed(): never {
  throw new ApiError('validation_failed');
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

export function createGoogleCalendarRoutes(
  service: GoogleCalendarRouteService,
  syncService?: GoogleCalendarRouteSyncService,
): ApiRouteDefinition[] {
  return [
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
}
