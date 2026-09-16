import {
  calendarCommandResultSchema,
  calendarCommandSchema,
  syncPullQuerySchema,
  syncPullResponseSchema,
  syncPushRequestSchema,
  syncPushResponseSchema,
  syncSnapshotResponseSchema,
  uuidSchema,
  type CalendarCommand,
  type CalendarCommandResult,
  type SyncMutationContract,
  type SyncPullResponseContract,
  type SyncPushResponseInput,
  type SyncSnapshotResponseContract,
} from '@misyra/contracts';

import { ApiError, type ApiRouteDefinition } from './index.js';

export type AppleCalendarCommandClaim = Readonly<{
  claimToken: string;
  occurrenceId: string;
  providerCalendarId: string;
  command: CalendarCommand;
}>;

export type SyncRouteServices = Readonly<{
  push: (
    accountId: string,
    mutations: readonly SyncMutationContract[],
  ) => Promise<Readonly<SyncPushResponseInput>>;
  pull: (
    accountId: string,
    input: Readonly<{ cursor: number; limit: number }>,
  ) => Promise<SyncPullResponseContract>;
  snapshot: (accountId: string) => Promise<SyncSnapshotResponseContract>;
  claimAppleCalendarCommand?: (accountId: string) => Promise<AppleCalendarCommandClaim | null>;
  settleAppleCalendarCommand?: (
    accountId: string,
    claimToken: string,
    result: CalendarCommandResult,
  ) => Promise<void>;
}>;

function parseAppleSettlement(value: unknown): Readonly<{
  claimToken: string;
  result: CalendarCommandResult;
}> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError('validation_failed');
  }
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) => key !== 'claimToken' && key !== 'result')) {
    throw new ApiError('validation_failed');
  }
  const claimToken = uuidSchema.safeParse(source.claimToken);
  const result = calendarCommandResultSchema.safeParse(source.result);
  if (!claimToken.success || !result.success) throw new ApiError('validation_failed');
  return { claimToken: claimToken.data, result: result.data };
}

export function createSyncRoutes(services: SyncRouteServices): ApiRouteDefinition[] {
  const routes: ApiRouteDefinition[] = [
    {
      method: 'POST',
      path: '/sync/push',
      handler: async (request, _reply, auth) => {
        const parsed = syncPushRequestSchema.safeParse(request.body);
        if (!parsed.success) throw new ApiError('validation_failed');
        if (parsed.data.mutations.some((mutation) => mutation.accountId !== auth.accountId)) {
          throw new ApiError('forbidden');
        }
        return syncPushResponseSchema.parse(
          await services.push(auth.accountId, parsed.data.mutations),
        );
      },
    },
    {
      method: 'GET',
      path: '/sync/pull',
      handler: async (request, _reply, auth) => {
        const parsed = syncPullQuerySchema.safeParse(request.query);
        if (!parsed.success) throw new ApiError('validation_failed');
        return syncPullResponseSchema.parse(await services.pull(auth.accountId, parsed.data));
      },
    },
    {
      method: 'GET',
      path: '/sync/snapshot',
      handler: async (_request, _reply, auth) =>
        syncSnapshotResponseSchema.parse(await services.snapshot(auth.accountId)),
    },
  ];

  if (
    services.claimAppleCalendarCommand !== undefined &&
    services.settleAppleCalendarCommand !== undefined
  ) {
    routes.push(
      {
        method: 'POST',
        path: '/sync/apple-calendar/commands/claim',
        handler: async (_request, _reply, auth) => {
          const claim = await services.claimAppleCalendarCommand?.(auth.accountId);
          if (claim === undefined || claim === null) return { claim: null };
          const claimToken = uuidSchema.safeParse(claim.claimToken);
          const occurrenceId = uuidSchema.safeParse(claim.occurrenceId);
          if (
            !claimToken.success ||
            !occurrenceId.success ||
            claim.providerCalendarId.length === 0
          ) {
            throw new Error('Invalid Apple calendar command claim from store');
          }
          return {
            claim: {
              claimToken: claimToken.data,
              occurrenceId: occurrenceId.data,
              providerCalendarId: claim.providerCalendarId,
              command: calendarCommandSchema.parse(claim.command),
            },
          };
        },
      },
      {
        method: 'POST',
        path: '/sync/apple-calendar/commands/settle',
        handler: async (request, _reply, auth) => {
          const body = parseAppleSettlement(request.body);
          await services.settleAppleCalendarCommand?.(auth.accountId, body.claimToken, body.result);
          return { settled: true as const };
        },
      },
    );
  }

  return routes;
}
