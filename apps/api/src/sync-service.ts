import {
  SyncDeviceOwnershipError,
  SyncMutationConflictError,
  createPostgresSyncStore,
  type PostgresSyncStore,
} from '@misyra/database';
import type { Pool } from 'pg';

import { ApiError } from './index.js';
import type { SyncRouteServices } from './sync-routes.js';

function mapChange(change: {
  sequence: number;
  entityType: string;
  entityId: string;
  operation: string;
  payload: unknown;
}) {
  return {
    sequence: change.sequence,
    entityType: change.entityType,
    entityId: change.entityId,
    operation: change.operation,
    payload: change.payload,
  };
}

async function mapStoreErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof SyncDeviceOwnershipError) throw new ApiError('forbidden');
    if (error instanceof SyncMutationConflictError) throw new ApiError('conflict');
    throw error;
  }
}

export function createSyncService(store: PostgresSyncStore): SyncRouteServices {
  return {
    push: (accountId, mutations) =>
      mapStoreErrors(async () => {
        const result = await store.push(accountId, mutations);
        return { acceptedMutationIds: [...result.acceptedMutationIds], conflicts: [] };
      }),

    pull: (accountId, input) =>
      mapStoreErrors(async () => {
        const page = await store.pull(accountId, input);
        if (page.kind === 'snapshot_required') return page;
        return {
          kind: 'incremental' as const,
          changes: page.changes.map(mapChange),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        };
      }),

    snapshot: (accountId) =>
      mapStoreErrors(async () => {
        const snapshot = await store.snapshot(accountId);
        return {
          entries: snapshot.entries.map(mapChange),
          nextCursor: snapshot.nextCursor,
        };
      }),
  };
}

export function createPostgresSyncService(pool: Pool) {
  return createSyncService(createPostgresSyncStore(pool));
}
