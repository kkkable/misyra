import type {
  MutationQueue,
  PendingMutation,
  SyncMutation,
} from '../storage/mutation-queue.js';
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
  push(
    mutations: readonly SyncMutation[],
  ): Promise<Readonly<{ acceptedMutationIds: readonly string[] }>>;
  pull(input: Readonly<{ cursor: number; limit: number }>): Promise<SyncPullResponse>;
  snapshot(): Promise<SyncSnapshot>;
}

export interface ServerSyncDatabase extends MigrationDatabase {}

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
    throw new RangeError(
      `Sync batch size must be an integer from 1 to ${String(MAX_BATCH_SIZE)}.`,
    );
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

function serverPending(items: readonly PendingMutation[]): PendingMutation[] {
  return items.filter((item) => item.destination.kind === 'server');
}

function validateAcceptedIds(
  batch: readonly PendingMutation[],
  acceptedMutationIds: readonly string[],
): Set<string> {
  const batchIds = new Set(batch.map((item) => item.mutation.mutationId));
  const accepted = new Set<string>();
  for (const mutationId of acceptedMutationIds) {
    if (!batchIds.has(mutationId)) {
      throw new Error(`Server accepted unknown mutation ID: ${mutationId}.`);
    }
    accepted.add(mutationId);
  }
  return accepted;
}

function validateIncrementalPage(
  page: Extract<SyncPullResponse, { kind: 'incremental' }>,
  cursor: number,
) {
  assertCursor(page.nextCursor, 'Pull next cursor');
  let previous = cursor;
  for (const change of page.changes) {
    assertCursor(change.sequence, 'Change sequence');
    if (change.sequence <= previous) {
      throw new Error('Authoritative changes must be strictly ordered after the current cursor.');
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

  const pushQueuedMutations = async (): Promise<number> => {
    let settled = 0;
    while (true) {
      const pending = serverPending(await options.mutationQueue.listPending()).slice(0, batchSize);
      if (pending.length === 0) return settled;

      const result = await options.transport.push(pending.map((item) => item.mutation));
      const accepted = validateAcceptedIds(pending, result.acceptedMutationIds);
      if (accepted.size === 0) return settled;

      await options.database.withExclusiveTransactionAsync(async (transaction) => {
        for (const mutationId of accepted) {
          await transaction.runAsync(
            'DELETE FROM mutation_queue WHERE account_id = ? AND mutation_id = ?',
            options.accountId,
            mutationId,
          );
        }
      });
      settled += accepted.size;
    }
  };

  const pullAuthoritativeState = async (): Promise<number> => {
    let cursor = await readCursor(options.database, options.accountId);

    while (true) {
      const page = await options.transport.pull({ cursor, limit: batchSize });
      if (page.kind === 'snapshot_required') {
        const snapshot = await options.transport.snapshot();
        const snapshotCursor = assertCursor(snapshot.nextCursor, 'Snapshot cursor');
        await options.database.withExclusiveTransactionAsync(async (transaction) => {
          await options.applySnapshot(transaction, snapshot.entries);
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

  return {
    run: async () => {
      const settledMutations = await pushQueuedMutations();
      const cursor = await pullAuthoritativeState();
      return { settledMutations, cursor };
    },
  };
}

export type ServerSync = ReturnType<typeof createServerSync>;
