import { calendarConnectionSchema, connectCalendarInputSchema } from '@misyra/contracts';

import { ApiError, type ApiRouteDefinition } from './index.js';

export type AppleCalendarRouteService = Readonly<{
  connect(
    accountId: string,
    input: Readonly<{
      providerCalendarId: string;
      initialSyncDirection: 'external_to_misyra' | 'misyra_to_external';
    }>,
  ): Promise<Readonly<{
    id: string;
    accountId: string;
    provider: 'apple';
    providerCalendarId: string;
    initialSyncDirection: 'external_to_misyra' | 'misyra_to_external';
    state: 'connected' | 'permission_revoked' | 'provider_unavailable' | 'disconnected';
  }>>;
}>;

export class AppleCalendarConnectionError extends Error {
  readonly code: 'connection_exists';

  constructor(code: 'connection_exists') {
    super(code);
    this.name = 'AppleCalendarConnectionError';
    this.code = code;
  }
}

function validationFailed(): never {
  throw new ApiError('validation_failed');
}

function parseConnectBody(value: unknown) {
  const parsed = connectCalendarInputSchema.safeParse(value);
  if (!parsed.success || parsed.data.provider !== 'apple') return validationFailed();
  return parsed.data;
}

function mapAppleCalendarError(error: unknown): never {
  if (error instanceof AppleCalendarConnectionError && error.code === 'connection_exists') {
    throw new ApiError('conflict');
  }
  throw error;
}

async function runAppleCalendarOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return mapAppleCalendarError(error);
  }
}

export function createAppleCalendarRoutes(service: AppleCalendarRouteService): ApiRouteDefinition[] {
  return [
    {
      method: 'POST',
      path: '/calendars/apple/connect',
      handler: async (request, _reply, auth) => {
        const body = parseConnectBody(request.body);
        const connection = await runAppleCalendarOperation(() =>
          service.connect(auth.accountId, {
            providerCalendarId: body.providerCalendarId,
            initialSyncDirection: body.initialSyncDirection,
          }),
        );
        return calendarConnectionSchema.parse({
          id: connection.id,
          provider: connection.provider,
          providerCalendarId: connection.providerCalendarId,
          initialSyncDirection: connection.initialSyncDirection,
          state: connection.state,
        });
      },
    },
  ];
}
