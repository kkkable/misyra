import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { RepositoryNotFoundError, TransactionRequiredError } from './repositories.js';

export type RewardBasisDifficulty = 'easy' | 'normal' | 'hard';

export interface RewardBasisRow extends QueryResultRow {
  occurrenceId: string;
  accountId: string;
  difficulty: RewardBasisDifficulty | null;
  baseXp: number;
  revokedAt: Date | null;
  updatedAt: Date;
}

export class RewardBasisRevokedError extends Error {
  constructor() {
    super('Reward basis has been permanently revoked');
    this.name = 'RewardBasisRevokedError';
  }
}

export interface RewardBasisStore {
  findBasisByOccurrenceId(occurrenceId: string): Promise<RewardBasisRow | null>;
  upsertBasis(
    occurrenceId: string,
    basis: Readonly<{ difficulty: RewardBasisDifficulty; baseXp: number }>,
  ): Promise<RewardBasisRow>;
  revokeBasis(occurrenceId: string, revokedAt: Date): Promise<RewardBasisRow>;
}

type DatabaseClient = Pool | PoolClient;

function requireTransaction(inTransaction: boolean): void {
  if (!inTransaction) {
    throw new TransactionRequiredError();
  }
}

async function requireActiveOccurrence(
  client: DatabaseClient,
  accountId: string,
  occurrenceId: string,
): Promise<void> {
  const result = await client.query(
    `SELECT o.id
     FROM mission_occurrences o
     WHERE o.id = $1
       AND o.account_id = $2
       AND o.deletion_state = 'active'
       AND NOT EXISTS (
         SELECT 1
         FROM mission_occurrence_tombstones t
         WHERE t.occurrence_id = o.id AND t.account_id = o.account_id
       )
     FOR UPDATE OF o`,
    [occurrenceId, accountId],
  );
  if (result.rowCount !== 1) {
    throw new RepositoryNotFoundError('Mission occurrence');
  }
}

function selectBasisSql(lock: boolean): string {
  return `SELECT
            occurrence_id AS "occurrenceId",
            account_id AS "accountId",
            difficulty,
            base_xp AS "baseXp",
            revoked_at AS "revokedAt",
            updated_at AS "updatedAt"
          FROM mission_reward_basis
          WHERE occurrence_id = $1 AND account_id = $2${lock ? ' FOR UPDATE' : ''}`;
}

function createBoundRewardBasisStore(
  client: DatabaseClient,
  accountId: string,
  inTransaction: boolean,
): RewardBasisStore {
  return {
    async findBasisByOccurrenceId(occurrenceId) {
      const result = await client.query<RewardBasisRow>(selectBasisSql(false), [
        occurrenceId,
        accountId,
      ]);
      return result.rows[0] ?? null;
    },

    async upsertBasis(occurrenceId, basis) {
      requireTransaction(inTransaction);
      await requireActiveOccurrence(client, accountId, occurrenceId);
      const current = await client.query<RewardBasisRow>(selectBasisSql(true), [
        occurrenceId,
        accountId,
      ]);
      if (current.rows[0]?.revokedAt != null) {
        throw new RewardBasisRevokedError();
      }

      const result = await client.query<RewardBasisRow>(
        `INSERT INTO mission_reward_basis (
           occurrence_id, account_id, difficulty, base_xp, revoked_at
         ) VALUES ($1, $2, $3, $4, NULL)
         ON CONFLICT (occurrence_id) DO UPDATE
         SET difficulty = EXCLUDED.difficulty,
             base_xp = EXCLUDED.base_xp,
             updated_at = now()
         WHERE mission_reward_basis.account_id = EXCLUDED.account_id
           AND mission_reward_basis.revoked_at IS NULL
         RETURNING
           occurrence_id AS "occurrenceId",
           account_id AS "accountId",
           difficulty,
           base_xp AS "baseXp",
           revoked_at AS "revokedAt",
           updated_at AS "updatedAt"`,
        [occurrenceId, accountId, basis.difficulty, basis.baseXp],
      );
      const saved = result.rows[0];
      if (saved === undefined) {
        throw new RewardBasisRevokedError();
      }
      return saved;
    },

    async revokeBasis(occurrenceId, revokedAt) {
      requireTransaction(inTransaction);
      await requireActiveOccurrence(client, accountId, occurrenceId);
      const currentResult = await client.query<RewardBasisRow>(selectBasisSql(true), [
        occurrenceId,
        accountId,
      ]);
      const current = currentResult.rows[0];
      if (current?.revokedAt != null) {
        return current;
      }

      const result = await client.query<RewardBasisRow>(
        `INSERT INTO mission_reward_basis (
           occurrence_id, account_id, difficulty, base_xp, revoked_at
         ) VALUES ($1, $2, NULL, 0, $3)
         ON CONFLICT (occurrence_id) DO UPDATE
         SET base_xp = 0,
             revoked_at = COALESCE(mission_reward_basis.revoked_at, EXCLUDED.revoked_at),
             updated_at = now()
         WHERE mission_reward_basis.account_id = EXCLUDED.account_id
         RETURNING
           occurrence_id AS "occurrenceId",
           account_id AS "accountId",
           difficulty,
           base_xp AS "baseXp",
           revoked_at AS "revokedAt",
           updated_at AS "updatedAt"`,
        [occurrenceId, accountId, revokedAt],
      );
      const revoked = result.rows[0];
      if (revoked === undefined) {
        throw new RepositoryNotFoundError('Reward basis');
      }
      return revoked;
    },
  };
}

export function createRewardBasisStore(pool: Pool, accountId: string): RewardBasisStore {
  return createBoundRewardBasisStore(pool, accountId, false);
}

export async function runRewardBasisTransaction<T>(
  pool: Pool,
  accountId: string,
  work: (store: RewardBasisStore) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      const result = await work(createBoundRewardBasisStore(client, accountId, true));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
}
