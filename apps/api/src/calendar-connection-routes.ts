import { calendarConnectionSchema, disconnectCalendarRequestSchema } from '@misyra/contracts';

import { ApiError, type ApiRouteDefinition } from './index.js';

export type CalendarConnectionRouteStatus = Readonly<{
  id: string;
  provider: 'apple' | 'google';
  providerCalendarId: string;
  initialSyncDirection: 'external_to_misyra' | 'misyra_to_external';
  state: 'connected' | 'permission_revoked' | 'provider_unavailable' | 'disconnected';
}>;

export type CalendarConnectionRouteService = Readonly<{
  getStatus(accountId: string): Promise<CalendarConnectionRouteStatus | null>;
  disconnect(accountId: string, connectionId: string): Promise<void>;
}>;

export class CalendarConnectionError extends Error {
  readonly code: 'not_found' | 'provider_error';

  constructor(code: 'not_found' | 'provider_error') {
    super(code);
    this.name = 'CalendarConnectionError';
    this.code = code;
  }
}

function validationFailed(): never {
  throw new ApiError('validation_failed');
}

function parseDisconnectBody(value: unknown) {
  const parsed = disconnectCalendarRequestSchema.safeParse(value);
  return parsed.success ? parsed.data : validationFailed();
}

function mapCalendarConnectionError(error: unknown): never {
  if (error instanceof CalendarConnectionError) {
    if (error.code === 'not_found') throw new ApiError('not_found');
    throw new ApiError('temporarily_unavailable');
  }
  throw error;
}

async function runCalendarConnectionOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return mapCalendarConnectionError(error);
  }
}

export function createCalendarConnectionRoutes(
  service: CalendarConnectionRouteService,
): ApiRouteDefinition[] {
  return [
    {
      method: 'GET',
      path: '/calendars/connection',
      handler: async (_request, _reply, auth) => {
        const connection = await runCalendarConnectionOperation(() =>
          service.getStatus(auth.accountId),
        );
        return {
          connection: connection === null ? null : calendarConnectionSchema.parse(connection),
        };
      },
    },
    {
      method: 'POST',
      path: '/calendars/disconnect',
      handler: async (request, _reply, auth) => {
        const body = parseDisconnectBody(request.body);
        await runCalendarConnectionOperation(() =>
          service.disconnect(auth.accountId, body.connectionId),
        );
        return { disconnected: true as const };
      },
    },
  ];
}
