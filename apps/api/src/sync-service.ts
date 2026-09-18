import {
  SyncDeviceOwnershipError,
  SyncMutationConflictError,
  SyncMutationValidationError,
  createPostgresAppleCalendarDeviceCommandStore,
  createPostgresEventKitSyncStore,
  type PostgresSyncStore,
} from '@misyra/database';
import { calendarCommandSchema, type CalendarCommandResult } from '@misyra/contracts';
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

function throwMappedStoreError(error: unknown): never {
  if (error instanceof SyncDeviceOwnershipError) throw new ApiError('forbidden');
  if (error instanceof SyncMutationConflictError) throw new ApiError('conflict');
  if (error instanceof SyncMutationValidationError) throw new ApiError('validation_failed');
  throw error;
}

async function mapStoreErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throwMappedStoreError(error);
  }
}

type AppleCommandClaim = Readonly<{
  claimToken: string;
  occurrenceId: string;
  providerCalendarId: string;
  command: unknown;
}>;

type AppleCommandSettlement =
  | Readonly<{
      commandId: string;
      claimToken: string;
      status: 'applied';
      providerEventId: string;
    }>
  | Readonly<{
      commandId: string;
      claimToken: string;
      status: 'failed';
      errorCode: string;
    }>;

type AppleCommandService = Readonly<{
  claimNext(accountId: string): Promise<AppleCommandClaim | null>;
  settle(accountId: string, input: AppleCommandSettlement): Promise<void>;
}>;

export function createSyncService(
  store: PostgresSyncStore,
  appleCommands?: AppleCommandService,
): SyncRouteServices {
  return {
    push: async (accountId, mutations) => {
      const acceptedMutationIds: string[] = [];
      const conflicts: Array<{
        kind: 'mission_deleted';
        mutationId: string;
        missionId: string;
      }> = [];

      for (const mutation of mutations) {
        const storedMutation = {
          ...mutation,
          payload: mutation.payload,
        };
        try {
          const result = await store.push(accountId, [storedMutation]);
          acceptedMutationIds.push(...result.acceptedMutationIds);
        } catch (error) {
          if (
            error instanceof SyncMutationConflictError &&
            error.message === 'Mission occurrence is permanently deleted' &&
            mutation.entityType === 'mission'
          ) {
            conflicts.push({
              kind: 'mission_deleted',
              mutationId: mutation.mutationId,
              missionId: mutation.entityId,
            });
            break;
          }
          throwMappedStoreError(error);
        }
      }

      return { acceptedMutationIds, conflicts };
    },

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

    ...(appleCommands === undefined
      ? {}
      : {
          claimAppleCalendarCommand: (accountId: string) =>
            mapStoreErrors(async () => {
              const claim = await appleCommands.claimNext(accountId);
              if (claim === null) return null;
              return {
                ...claim,
                command: calendarCommandSchema.parse(claim.command),
              };
            }),
          settleAppleCalendarCommand: (
            accountId: string,
            claimToken: string,
            result: CalendarCommandResult,
          ) =>
            mapStoreErrors(() =>
              appleCommands.settle(accountId, {
                ...result,
                claimToken,
              }),
            ),
        }),
  };
}

export function createPostgresSyncService(pool: Pool) {
  return createSyncService(
    createPostgresEventKitSyncStore(pool),
    createPostgresAppleCalendarDeviceCommandStore(pool),
  );
}
