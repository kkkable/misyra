import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations } from './migrations.js';

type UnknownRecord = Record<string, unknown>;
type AsyncFunction = (...args: unknown[]) => Promise<unknown>;
type RepositorySet = Record<string, UnknownRecord>;
type TransactionWork = (repositories: RepositorySet) => Promise<unknown>;
type RunInTransaction = (
  pool: Pool,
  accountId: string,
  work: TransactionWork,
) => Promise<unknown>;
type CreateAccountRepositories = (pool: Pool, accountId: string) => RepositorySet;

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts057_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

let pool: Pool;
let accountId: string;
let occurrenceId: string;

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Missing required database record: ${label}`);
  }
  return value as UnknownRecord;
}

function requireAsyncFunction(value: unknown, label: string): AsyncFunction {
  if (typeof value !== 'function') {
    throw new TypeError(`Missing required database function: ${label}`);
  }
  return value as AsyncFunction;
}

async function loadRepositoryContract(): Promise<{
  createAccountRepositories: CreateAccountRepositories;
  runInTransaction: RunInTransaction;
}> {
  const module = (await import('./index.js')) as UnknownRecord;
  const createAccountRepositories = module.createAccountRepositories;
  const runInTransaction = module.runInTransaction;

  if (typeof createAccountRepositories !== 'function') {
    throw new TypeError('Missing required database function: createAccountRepositories');
  }
  if (typeof runInTransaction !== 'function') {
    throw new TypeError('Missing required database function: runInTransaction');
  }

  return {
    createAccountRepositories: createAccountRepositories as CreateAccountRepositories,
    runInTransaction: runInTransaction as RunInTransaction,
  };
}

beforeAll(async () => {
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();

  await applyMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });

  accountId = randomUUID();
  const seriesId = randomUUID();
  occurrenceId = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, provider, provider_subject) VALUES ($1, 'google', $2)`,
    [accountId, `mts057-${accountId}`],
  );
  await pool.query(`INSERT INTO mission_series (id, account_id, title) VALUES ($1, $2, $3)`, [
    seriesId,
    accountId,
    'Reward basis mission',
  ]);
  await pool.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day, reward_eligibility
     ) VALUES ($1, $2, $3, '2026-09-12', '09:00', '10:00',
       '2026-09-12T09:00:00Z', '2026-09-12T10:00:00Z', 'UTC', 'local_time', false, 'eligible')`,
    [occurrenceId, accountId, seriesId],
  );
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

describe('MTS-057 reward basis persistence', () => {
  it('persists one account-scoped difficulty/base-XP basis transactionally', async () => {
    const { createAccountRepositories, runInTransaction } = await loadRepositoryContract();
    const outsideRewards = requireRecord(
      createAccountRepositories(pool, accountId).rewards,
      'rewards',
    );
    const outsideUpsert = requireAsyncFunction(
      outsideRewards.upsertBasis,
      'rewards.upsertBasis',
    );

    await expect(
      outsideUpsert(occurrenceId, { difficulty: 'hard', baseXp: 170 }),
    ).rejects.toMatchObject({ name: 'TransactionRequiredError' });

    await runInTransaction(pool, accountId, async (repositories) => {
      const rewards = requireRecord(repositories.rewards, 'rewards');
      const upsertBasis = requireAsyncFunction(rewards.upsertBasis, 'rewards.upsertBasis');
      await expect(
        upsertBasis(occurrenceId, { difficulty: 'hard', baseXp: 170 }),
      ).resolves.toMatchObject({
        occurrenceId,
        accountId,
        difficulty: 'hard',
        baseXp: 170,
        revokedAt: null,
      });
    });

    const repositories = createAccountRepositories(pool, accountId);
    const rewards = requireRecord(repositories.rewards, 'rewards');
    const findBasisByOccurrenceId = requireAsyncFunction(
      rewards.findBasisByOccurrenceId,
      'rewards.findBasisByOccurrenceId',
    );
    await expect(findBasisByOccurrenceId(occurrenceId)).resolves.toMatchObject({
      difficulty: 'hard',
      baseXp: 170,
      revokedAt: null,
    });
  });

  it('revokes to zero idempotently and never allows an eligible basis to be restored', async () => {
    const { createAccountRepositories, runInTransaction } = await loadRepositoryContract();
    const revokedAt = new Date('2026-09-12T09:01:00.000Z');

    await runInTransaction(pool, accountId, async (repositories) => {
      const rewards = requireRecord(repositories.rewards, 'rewards');
      const revokeBasis = requireAsyncFunction(rewards.revokeBasis, 'rewards.revokeBasis');
      await expect(revokeBasis(occurrenceId, revokedAt)).resolves.toMatchObject({
        difficulty: 'hard',
        baseXp: 0,
        revokedAt,
      });
      await expect(
        revokeBasis(occurrenceId, new Date('2026-09-12T09:02:00.000Z')),
      ).resolves.toMatchObject({
        baseXp: 0,
        revokedAt,
      });
    });

    await expect(
      runInTransaction(pool, accountId, async (repositories) => {
        const rewards = requireRecord(repositories.rewards, 'rewards');
        const upsertBasis = requireAsyncFunction(rewards.upsertBasis, 'rewards.upsertBasis');
        await upsertBasis(occurrenceId, { difficulty: 'easy', baseXp: 50 });
      }),
    ).rejects.toMatchObject({ name: 'RewardBasisRevokedError' });

    const rewards = requireRecord(createAccountRepositories(pool, accountId).rewards, 'rewards');
    const findBasisByOccurrenceId = requireAsyncFunction(
      rewards.findBasisByOccurrenceId,
      'rewards.findBasisByOccurrenceId',
    );
    await expect(findBasisByOccurrenceId(occurrenceId)).resolves.toMatchObject({
      difficulty: 'hard',
      baseXp: 0,
      revokedAt,
    });
  });
});
