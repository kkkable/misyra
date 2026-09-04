import type { MigrationDatabase, SqlBindValue } from './schema.js';

const MAX_RETRY_ATTEMPTS = 5;

export interface MutationQueueDatabase extends MigrationDatabase {
  getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]>;
}

export type MutationTarget =
  | Readonly<{ kind: 'internal' }>
  | Readonly<{ kind: 'external_calendar'; provider: string }>;

export type MutationCommand = Readonly<{
  kind: string;
  target: MutationTarget;
  payload?: unknown;
}>;

export type PendingMutation = Readonly<{
  mutationId: string;
  sequence: number;
  command: MutationCommand;
  createdAt: string;
}>;

export type EnqueueMutation = Readonly<{
  mutationId: string;
  command: MutationCommand;
  createdAt: string;
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

interface MutationRow {
  readonly mutation_id: string;
  readonly sequence: number;
  readonly command_json: string;
  readonly created_at: string;
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) throw new TypeError(`${name} must not be empty.`);
}

function assertCommand(command: MutationCommand): void {
  assertNonEmpty(command.kind, 'Mutation command kind');
  if (command.target.kind === 'external_calendar') {
    assertNonEmpty(command.target.provider, 'External mutation provider');
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

function parseCommand(source: string): MutationCommand {
  const value = JSON.parse(source) as Partial<MutationCommand>;
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof value.kind !== 'string' ||
    typeof value.target !== 'object' ||
    value.target === null ||
    (value.target.kind !== 'internal' && value.target.kind !== 'external_calendar')
  ) {
    throw new TypeError('Stored mutation command is invalid.');
  }
  const command = value as MutationCommand;
  assertCommand(command);
  return command;
}

function mapMutation(row: MutationRow): PendingMutation {
  return {
    mutationId: row.mutation_id,
    sequence: row.sequence,
    command: parseCommand(row.command_json),
    createdAt: row.created_at,
  };
}

export function createMutationQueue(database: MutationQueueDatabase, accountId: string) {
  assertNonEmpty(accountId, 'Account ID');

  const listPending = async (): Promise<PendingMutation[]> => {
    const rows = await database.getAllAsync<MutationRow>(
      `SELECT mutation_id, sequence, command_json, created_at
         FROM mutation_queue
        WHERE account_id = ?
        ORDER BY sequence`,
      accountId,
    );
    return rows.map(mapMutation);
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
      assertNonEmpty(input.mutationId, 'Mutation ID');
      assertNonEmpty(input.createdAt, 'Mutation createdAt');
      assertCommand(input.command);

      await database.withExclusiveTransactionAsync(async (transaction) => {
        const existing = await transaction.getFirstAsync<{ mutation_id: string }>(
          'SELECT mutation_id FROM mutation_queue WHERE account_id = ? AND mutation_id = ?',
          accountId,
          input.mutationId,
        );
        if (existing !== null) return;

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
          input.mutationId,
          sequence,
          JSON.stringify(input.command),
          input.createdAt,
        );
      });
    },

    listPending,

    processPending: async (options: ProcessPendingOptions): Promise<ProcessPendingResult> => {
      const maxAttempts = assertRetryLimit(options.maxAttemptsPerMutation);
      const pending = await listPending();
      let processed = 0;

      for (const mutation of pending) {
        let succeeded = false;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            await options.execute(mutation);
            succeeded = true;
            break;
          } catch {
            if (attempt === maxAttempts) {
              return {
                processed,
                remaining: await countPending(),
                stoppedOn: mutation.mutationId,
              };
            }
          }
        }

        if (!succeeded) break;
        await database.runAsync(
          'DELETE FROM mutation_queue WHERE account_id = ? AND mutation_id = ?',
          accountId,
          mutation.mutationId,
        );
        processed += 1;
      }

      return { processed, remaining: await countPending(), stoppedOn: null };
    },

    discardExternalCommands: async (provider: string): Promise<number> => {
      assertNonEmpty(provider, 'External mutation provider');
      let discarded = 0;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const rows = await database.getAllAsync<MutationRow>(
          `SELECT mutation_id, sequence, command_json, created_at
             FROM mutation_queue
            WHERE account_id = ?
            ORDER BY sequence`,
          accountId,
        );
        for (const row of rows) {
          const mutation = mapMutation(row);
          if (
            mutation.command.target.kind !== 'external_calendar' ||
            mutation.command.target.provider !== provider
          ) {
            continue;
          }
          const result = (await transaction.runAsync(
            'DELETE FROM mutation_queue WHERE account_id = ? AND mutation_id = ?',
            accountId,
            mutation.mutationId,
          )) as { changes?: number };
          discarded += result.changes ?? 0;
        }
      });
      return discarded;
    },
  };
}

export type MutationQueue = ReturnType<typeof createMutationQueue>;
