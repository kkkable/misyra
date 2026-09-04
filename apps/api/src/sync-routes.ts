import {
  syncPullQuerySchema,
  syncPullResponseSchema,
  syncPushRequestSchema,
  syncPushResponseSchema,
  syncSnapshotResponseSchema,
  type SyncMutationContract,
  type SyncPullResponseContract,
  type SyncPushResponseInput,
  type SyncSnapshotResponseContract,
} from '@misyra/contracts';

import { ApiError, type ApiRouteDefinition } from './index.js';

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
}>;

export function createSyncRoutes(services: SyncRouteServices): ApiRouteDefinition[] {
  return [
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
}
