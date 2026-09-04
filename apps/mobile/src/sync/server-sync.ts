import type { ConflictOutcome } from './conflict-application.js';
import type { MutationQueue, PendingMutation, SyncMutation } from '../storage/mutation-queue.js';
import type { MigrationDatabase } from '../storage/schema.js';

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

export type ServerAccountChange = Readonly<{
  sequence: number;
  entityType: string;
  entityId: string;
  operation: string;
  payload: unknown;
}>;

export type SyncConflictResult = ConflictOutcome & Readonly<{ mutationId: string }>;

export type SyncPullResponse =
  | Readonly<{
      kind: 'incremental';
      changes: readonly ServerAccountChange[];
      nextCursor: number;
      hasMore: boolean;
    }>
  | Readonly<{
      kind: 'snapshot_required';
      reason: 'invalid_cursor' | 'expired_cursor';
      nextCursor: number;
    }>;

export type SyncSnapshot = Readonly<{
  entries: readonly ServerAccountChange[];
  nextCursor: number;
}>;

export interface ServerSyncTransport {
  push(mutations: readonly SyncMutation[]): Promise<
    Readonly<{
      acceptedMutationIds: readonly string[];
      conflicts?: readonly SyncConflictResult[];
    }>
  >;
  pull(input: Readonly<{ cursor: number; limit: number }>): Promise<SyncPullResponse>;
  snapshot(): Promise<SyncSnapshot>;
}

export type ServerSyncDatabase = MigrationDatabase;

export type ServerSyncOptions = Readonly<{
  database: ServerSyncDatabase;
  accountId: string;
  mutationQueue: MutationQueue;
  transport: ServerSyncTransport;
  applyChanges: (
    transaction: MigrationDatabase,
    changes: readonly ServerAccountChange[],
  ) => Promise<void>;
  applySnapshot: (
    transaction: MigrationDatabase,
    entries: readonly ServerAccountChange[],
  ) => Promise<void>;
  applyConflicts?: (conflicts: readonly SyncConflictResult[]) => Promise<void>;
  batchSize?: number;
}>;

function assertCursor(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function resolveBatchSize(value: number | undefined): number {
  const batchSize = value ?? DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new RangeError(`Sync batch size must be an integer from 1 to ${String(MAX_BATCH_SIZE)}.`);
  }
  return batchSize;
}

async function readCursor(database: ServerSyncDatabase, accountId: string): Promise<number> {
  const row = await database.getFirstAsync<{ cursor: string }>(
    'SELECT cursor FROM sync_cursors WHERE account_id = ?',
    accountId,
  );
  if (row === null) return 0;
  return assertCursor(Number(row.cursor), 'Stored sync cursor');
}

async function writeCursor(
  transaction: MigrationDatabase,
  accountId: string,
  cursor: number,
): Promise<void> {
  const nextCursor = assertCursor(cursor, 'Sync cursor');
  await transaction.runAsync(
    `INSERT INTO sync_cursors (account_id, cursor, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       cursor = excluded.cursor,
       updated_at = excluded.updated_at`,
    accountId,
    String(nextCursor),
    new Date().toISOString(),
  );
}

async function listPendingMutationIds(
  transaction: MigrationDatabase,
  accountId: string,
): Promise<string[]> {
  const mutationIds: string[] = [];
  let previousSequence = 0;
  for (;;) {
    const row = await transaction.getFirstAsync<{ mutation_id: string; sequence: number }>(
      `SELECT mutation_id, sequence
         FROM mutation_queue
        WHERE account_id = ? AND sequence > ?
        ORDER BY sequence
        LIMIT 1`,
      accountId,
      previousSequence,
    );
    if (row === null) return mutationIds;
    if (!Number.isSafeInteger(row.sequence) || row.sequence <= previousSequence) {
      throw new Error('Mutation queue sequence is invalid during snapshot recovery.');
    }
    mutationIds.push(row.mutation_id);
    previousSequence = row.sequence;
  }
}

function serverPending(items: readonly PendingMutation[]): PendingMutation[] {
  return items.filter((item) => item.destination.kind === 'server');
}

function validateSettledPrefix(
  batch: readonly PendingMutation[],
  acceptedMutationIds: readonly string[],
  conflicts: readonly SyncConflictResult[],
): Set<string> {
  const settledIds = [...acceptedMutationIds, ...conflicts.map((conflict) => conflict.mutationId)];
  const unique = new Set(settledIds);
  if (unique.size !== settledIds.length) {
    throw new Error('A server mutation result must settle each mutation at most once.');
  }

  const expectedPrefix = batch.slice(0, unique.size).map((item) => item.mutation.mutationId);
  if (expectedPrefix.length !== unique.size || expectedPrefix.some((mutationId) => !unique.has(mutationId))) {
    throw new Error('Server mutation results must settle a contiguous queued prefix.');
  }
  return unique;
}

function validateIncrementalPage(
  page: Extract<SyncPullResponse, { kind: 'incremental' }>,
  cursor: number,
) {
  assertCursor(page.nextCursor, 'Pull next cursor');
  let previous = cursor;
  for (const change of page.changes) {
    assertCursor(change.sequence, 'Change sequence');
    if (change.sequence !== previous + 1) {
      throw new Error('Authoritative changes must be contiguous after the current cursor.');
    }
    previous = change.sequence;
  }

  if (page.changes.length > 0 && page.nextCursor !== previous) {
    throw new Error('Pull next cursor must equal the last authoritative change sequence.');
  }
  if (page.changes.length === 0 && page.nextCursor !== cursor) {
    throw new Error('An empty pull page must not advance the cursor.');
  }
  if (page.hasMore && page.changes.length === 0) {
    throw new Error('A paginated pull cannot report more data without returning progress.');
  }
}

export function createServerSync(options: ServerSyncOptions) {
  if (options.accountId.trim().length === 0) {
    throw new TypeError('Account ID must not be empty.');
  }
  const batchSize = resolveBatchSize(options.batchSize);
  let runTail: Promise<void> = Promise.resolve();

  const pushQueuedMutations = async (): Promise<{
    settled: number;
    conflicts: SyncConflictResult[];
  }> => {
    let settled = 0;
    const conflicts: SyncConflictResult[] = [];
    for (;;) {
      const pending = serverPending(await options.mutationQueue.listPending()).slice(0, batchSize);
      if (pending.length === 0) return { settled, conflicts };

      const result = await options.transport.push(pending.map((item) => item.mutation));
      const batchConflicts = [...(result.conflicts ?? [])];
      const settledIds = validateSettledPrefix(
        pending,
        result.acceptedMutationIds,
        batchConflicts,
      );
      if (settledIds.size === 0) return { settled, conflicts };

      await options.database.withExclusiveTransactionAsync(async (transaction) => {
        for (const mutationId of settledIds) {
          await transaction.runAsync(
            'DELETE FROM mutation_queue WHERE account_id = ? AND mutation_id = ?',
            options.accountId,
            mutationId,
          );
        }
      });
      conflicts.push(...batchConflicts);
      settled += settledIds.size;
    }
  };

  const pullAuthoritativeState = async (): Promise<number> => {
    let cursor = await readCursor(options.database, options.accountId);

    for (;;) {
      const page = await options.transport.pull({ cursor, limit: batchSize });
      if (page.kind === 'snapshot_required') {
        const snapshot = await options.transport.snapshot();
        const snapshotCursor = assertCursor(snapshot.nextCursor, 'Snapshot cursor');
        await options.database.withExclusiveTransactionAsync(async (transaction) => {
          const pendingMutationIds = await listPendingMutationIds(transaction, options.accountId);
          await options.applySnapshot(transaction, snapshot.entries);
          for (const mutationId of pendingMutationIds) {
            const retained = await transaction.getFirstAsync<{ mutation_id: string }>(
              'SELECT mutation_id FROM mutation_queue WHERE account_id = ? AND mutation_id = ?',
              options.accountId,
              mutationId,
            );
            if (retained === null) {
              throw new Error('Snapshot recovery removed an unsent mutation.');
            }
          }
          await writeCursor(transaction, options.accountId, snapshotCursor);
        });
        return snapshotCursor;
      }

      validateIncrementalPage(page, cursor);
      await options.database.withExclusiveTransactionAsync(async (transaction) => {
        await options.applyChanges(transaction, page.changes);
        await writeCursor(transaction, options.accountId, page.nextCursor);
      });
      cursor = page.nextCursor;
      if (!page.hasMore) return cursor;
    }
  };

  const executeRun = async () => {
    const pushResult = await pushQueuedMutations();
    const cursor = await pullAuthoritativeState();
    if (pushResult.conflicts.length > 0) {
      await options.applyConflicts?.(pushResult.conflicts);
    }
    return { settledMutations: pushResult.settled, cursor };
  };

  return {
    run: () => {
      const result = runTail.then(executeRun, executeRun);
      runTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

export type ServerSync = ReturnType<typeof createServerSync>;
