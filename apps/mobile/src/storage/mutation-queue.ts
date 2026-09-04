import type { MigrationDatabase, SqlBindValue } from './schema.js';

const MAX_RETRY_ATTEMPTS = 5;
const ENTITY_TYPES = ['mission', 'story', 'completion', 'evidence', 'settings'] as const;
const OPERATIONS = ['create', 'update', 'delete', 'complete', 'submit'] as const;

export interface MutationQueueDatabase extends MigrationDatabase {
  getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]>;
}

export type SyncMutationEntityType = (typeof ENTITY_TYPES)[number];
export type SyncMutationOperation = (typeof OPERATIONS)[number];

export interface SyncMutation<TPayload = unknown> {
  readonly mutationId: string;
  readonly accountId: string;
  readonly deviceId: string;
  readonly entityType: SyncMutationEntityType;
  readonly entityId: string;
  readonly operation: SyncMutationOperation;
  readonly baseVersion: number | null;
  readonly clientOccurredAt: string;
  readonly payload: TPayload;
}

export type MutationDestination =
  | Readonly<{ kind: 'server' }>
  | Readonly<{ kind: 'external_calendar'; provider: string }>;

export type PendingMutation = Readonly<{
  sequence: number;
  mutation: SyncMutation;
  destination: MutationDestination;
}>;

export type EnqueueMutation = Readonly<{
  mutation: SyncMutation;
  destination: MutationDestination;
  applyLocal: (transaction: MigrationDatabase) => Promise<void>;
}>;

export type ProcessPendingOptions = Readonly<{
  maxAttemptsPerMutation: number;
  execute: (mutation: PendingMutation) => Promise<void>;
}>;

export type ProcessPendingResult = Readonly<{
  processed: number;
  remaining: number;
  stoppedOn: string | null;
}>;

interface StoredEnvelope {
  readonly mutation: SyncMutation;
  readonly destination: MutationDestination;
}

interface MutationRow {
  readonly mutation_id: string;
  readonly sequence: number;
  readonly command_json: string;
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) throw new TypeError(`${name} must not be empty.`);
}

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

function assertMutation(mutation: SyncMutation, accountId: string): void {
  assertNonEmpty(mutation.mutationId, 'Mutation ID');
  assertNonEmpty(mutation.accountId, 'Mutation account ID');
  assertNonEmpty(mutation.deviceId, 'Mutation device ID');
  assertNonEmpty(mutation.entityId, 'Mutation entity ID');
  assertNonEmpty(mutation.clientOccurredAt, 'Mutation clientOccurredAt');
  if (mutation.accountId !== accountId) {
    throw new TypeError('Mutation account ID must match the queue account.');
  }
  if (!isOneOf(mutation.entityType, ENTITY_TYPES)) {
    throw new TypeError(`Unsupported mutation entity type: ${mutation.entityType}.`);
  }
  if (!isOneOf(mutation.operation, OPERATIONS)) {
    throw new TypeError(`Unsupported mutation operation: ${mutation.operation}.`);
  }
  if (
    mutation.baseVersion !== null &&
    (!Number.isSafeInteger(mutation.baseVersion) || mutation.baseVersion < 0)
  ) {
    throw new TypeError('Mutation baseVersion must be a non-negative integer or null.');
  }
}

function assertDestination(destination: MutationDestination): void {
  if (destination.kind === 'external_calendar') {
    assertNonEmpty(destination.provider, 'External mutation provider');
  }
}

function assertRetryLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_RETRY_ATTEMPTS) {
    throw new RangeError(
      `Mutation retry attempts must be an integer from 1 to ${String(MAX_RETRY_ATTEMPTS)}.`,
    );
  }
  return value;
}

function parseEnvelope(source: string, accountId: string): StoredEnvelope {
  const value = JSON.parse(source) as StoredEnvelope;
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof value.mutation !== 'object' ||
    value.mutation === null ||
    typeof value.destination !== 'object' ||
    value.destination === null ||
    (value.destination.kind !== 'server' && value.destination.kind !== 'external_calendar')
  ) {
    throw new TypeError('Stored mutation envelope is invalid.');
  }
  assertMutation(value.mutation, accountId);
  assertDestination(value.destination);
  return value;
}

function mapMutation(row: MutationRow, accountId: string): PendingMutation {
  const envelope = parseEnvelope(row.command_json, accountId);
  if (envelope.mutation.mutationId !== row.mutation_id) {
    throw new TypeError('Stored mutation ID does not match its queue key.');
  }
  return {
    sequence: row.sequence,
    mutation: envelope.mutation,
    destination: envelope.destination,
  };
}

export function createMutationQueue(database: MutationQueueDatabase, accountId: string) {
  assertNonEmpty(accountId, 'Account ID');

  const listPending = async (): Promise<PendingMutation[]> => {
    const rows = await database.getAllAsync<MutationRow>(
      `SELECT mutation_id, sequence, command_json
         FROM mutation_queue
        WHERE account_id = ?
        ORDER BY sequence`,
      accountId,
    );
    return rows.map((row) => mapMutation(row, accountId));
  };

  const countPending = async (): Promise<number> => {
    const row = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM mutation_queue WHERE account_id = ?',
      accountId,
    );
    return row?.count ?? 0;
  };

  return {
    enqueue: async (input: EnqueueMutation): Promise<void> => {
      assertMutation(input.mutation, accountId);
      assertDestination(input.destination);
      const storedEnvelope: StoredEnvelope = {
        mutation: input.mutation,
        destination: input.destination,
      };
      const serializedEnvelope = JSON.stringify(storedEnvelope);

      await database.withExclusiveTransactionAsync(async (transaction) => {
        const existing = await transaction.getFirstAsync<{ command_json: string }>(
          'SELECT command_json FROM mutation_queue WHERE account_id = ? AND mutation_id = ?',
          accountId,
          input.mutation.mutationId,
        );
        if (existing !== null) {
          if (existing.command_json !== serializedEnvelope) {
            throw new Error('Mutation ID is already queued with a different envelope.');
          }
          return;
        }

        const sequenceRow = await transaction.getFirstAsync<{ next_sequence: number }>(
          `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
             FROM mutation_queue
            WHERE account_id = ?`,
          accountId,
        );
        const sequence = sequenceRow?.next_sequence ?? 1;
        if (!Number.isSafeInteger(sequence) || sequence <= 0) {
          throw new Error('Mutation queue sequence is invalid.');
        }

        await input.applyLocal(transaction);
        await transaction.runAsync(
          `INSERT INTO mutation_queue
            (account_id, mutation_id, sequence, command_json, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          accountId,
          input.mutation.mutationId,
          sequence,
          serializedEnvelope,
          input.mutation.clientOccurredAt,
        );
      });
    },

    listPending,

    processPending: async (options: ProcessPendingOptions): Promise<ProcessPendingResult> => {
      const maxAttempts = assertRetryLimit(options.maxAttemptsPerMutation);
      const pending = await listPending();
      let processed = 0;

      for (const queuedMutation of pending) {
        let succeeded = false;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            await options.execute(queuedMutation);
            succeeded = true;
            break;
          } catch {
            if (attempt === maxAttempts) {
              return {
                processed,
                remaining: await countPending(),
                stoppedOn: queuedMutation.mutation.mutationId,
              };
            }
          }
        }

        if (!succeeded) break;
        await database.runAsync(
          'DELETE FROM mutation_queue WHERE account_id = ? AND mutation_id = ?',
          accountId,
          queuedMutation.mutation.mutationId,
        );
        processed += 1;
      }

      return { processed, remaining: await countPending(), stoppedOn: null };
    },

    discardExternalCommands: async (provider: string): Promise<number> => {
      assertNonEmpty(provider, 'External mutation provider');
      let discarded = 0;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const result = (await transaction.runAsync(
          `DELETE FROM mutation_queue
            WHERE account_id = ?
              AND json_extract(command_json, '$.destination.kind') = 'external_calendar'
              AND json_extract(command_json, '$.destination.provider') = ?`,
          accountId,
          provider,
        )) as { changes?: number };
        discarded = result.changes ?? 0;
      });
      return discarded;
    },
  };
}

export type MutationQueue = ReturnType<typeof createMutationQueue>;
