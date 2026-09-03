import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations } from './migrations.js';

type UnknownRecord = Record<string, unknown>;
type AsyncFunction = (...args: unknown[]) => Promise<unknown>;
type RepositorySet = Record<string, UnknownRecord>;
type TransactionWork = (repositories: RepositorySet) => Promise<unknown>;
type RunInTransaction = (pool: Pool, accountId: string, work: TransactionWork) => Promise<unknown>;
type CreateAccountRepositories = (pool: Pool, accountId: string) => RepositorySet;

const REQUIRED_REPOSITORIES = [
  'accounts',
  'missions',
  'notes',
  'completions',
  'rewards',
  'streaks',
  'stories',
  'plannerDrafts',
  'media',
  'feedback',
  'externalLinks',
] as const;

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts024_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

let pool: Pool;
let accountA: string;
let accountB: string;
let occurrenceA: string;
let occurrenceB: string;
let completedOccurrenceA: string;
let rollbackOccurrenceA: string;

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

async function insertOccurrence(
  accountId: string,
  title: string,
  completed = false,
): Promise<string> {
  const seriesId = randomUUID();
  const occurrenceId = randomUUID();
  await pool.query(`INSERT INTO mission_series (id, account_id, title) VALUES ($1, $2, $3)`, [
    seriesId,
    accountId,
    title,
  ]);
  await pool.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day, completion_state
     ) VALUES ($1, $2, $3, '2026-09-03', '09:00', '10:00',
       '2026-09-03T01:00:00Z', '2026-09-03T02:00:00Z', 'Asia/Hong_Kong', 'local_time', false, $4)`,
    [occurrenceId, accountId, seriesId, completed ? 'completed' : 'incomplete'],
  );
  return occurrenceId;
}

beforeAll(async () => {
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();

  await applyMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });

  accountA = randomUUID();
  accountB = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, provider, provider_subject) VALUES ($1, 'google', $2), ($3, 'apple', $4)`,
    [accountA, `mts024-a-${accountA}`, accountB, `mts024-b-${accountB}`],
  );
  occurrenceA = await insertOccurrence(accountA, 'A mission');
  occurrenceB = await insertOccurrence(accountB, 'B mission');
  completedOccurrenceA = await insertOccurrence(accountA, 'Completed A mission', true);
  rollbackOccurrenceA = await insertOccurrence(accountA, 'Rollback A mission');
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

describe('MTS-024 repository and transaction contract', () => {
  it('exposes account-scoped repositories for every ticket-owned aggregate', async () => {
    const { createAccountRepositories } = await loadRepositoryContract();
    const repositories = createAccountRepositories(pool, accountA);

    expect(Object.keys(repositories).sort()).toEqual([...REQUIRED_REPOSITORIES].sort());
  });

  it('keeps mission reads isolated to the bound account', async () => {
    const { createAccountRepositories } = await loadRepositoryContract();
    const repositoriesA = createAccountRepositories(pool, accountA);
    const missions = requireRecord(repositoriesA.missions, 'missions');
    const findOccurrenceById = requireAsyncFunction(
      missions.findOccurrenceById,
      'missions.findOccurrenceById',
    );

    await expect(findOccurrenceById(occurrenceA)).resolves.toMatchObject({ id: occurrenceA });
    await expect(findOccurrenceById(occurrenceB)).resolves.toBeNull();
  });

  it('requires a transaction and blocks editable mutation of a completed occurrence', async () => {
    const { createAccountRepositories, runInTransaction } = await loadRepositoryContract();
    const missionsOutsideTransaction = requireRecord(
      createAccountRepositories(pool, accountA).missions,
      'missions',
    );
    const outsideUpdate = requireAsyncFunction(
      missionsOutsideTransaction.updateOccurrenceSchedule,
      'missions.updateOccurrenceSchedule',
    );
    const patch = {
      localStart: '11:00',
      localFinish: '12:00',
      startInstant: new Date('2026-09-03T03:00:00Z'),
      finishInstant: new Date('2026-09-03T04:00:00Z'),
    };

    await expect(outsideUpdate(completedOccurrenceA, patch)).rejects.toMatchObject({
      name: 'TransactionRequiredError',
    });

    await expect(
      runInTransaction(pool, accountA, async (repositories) => {
        const missions = requireRecord(repositories.missions, 'missions');
        const updateOccurrenceSchedule = requireAsyncFunction(
          missions.updateOccurrenceSchedule,
          'missions.updateOccurrenceSchedule',
        );
        await updateOccurrenceSchedule(completedOccurrenceA, patch);
      }),
    ).rejects.toMatchObject({ name: 'CompletedOccurrenceMutationError' });
  });

  it('centralizes tombstone checks and requires a transaction for the multi-table delete invariant', async () => {
    const { createAccountRepositories, runInTransaction } = await loadRepositoryContract();
    const repositoriesA = createAccountRepositories(pool, accountA);
    const missionsOutsideTransaction = requireRecord(repositoriesA.missions, 'missions');
    const tombstoneOutsideTransaction = requireAsyncFunction(
      missionsOutsideTransaction.tombstoneOccurrence,
      'missions.tombstoneOccurrence',
    );

    await expect(tombstoneOutsideTransaction(occurrenceA, 'user_deleted')).rejects.toMatchObject({
      name: 'TransactionRequiredError',
    });

    await runInTransaction(pool, accountA, async (repositories) => {
      const missions = requireRecord(repositories.missions, 'missions');
      const tombstoneOccurrence = requireAsyncFunction(
        missions.tombstoneOccurrence,
        'missions.tombstoneOccurrence',
      );
      await tombstoneOccurrence(occurrenceA, 'user_deleted');
    });

    const tombstone = await pool.query(
      `SELECT account_id, reason FROM mission_occurrence_tombstones WHERE occurrence_id = $1`,
      [occurrenceA],
    );
    expect(tombstone.rows[0]).toMatchObject({ account_id: accountA, reason: 'user_deleted' });

    await expect(
      runInTransaction(pool, accountA, async (repositories) => {
        const missions = requireRecord(repositories.missions, 'missions');
        const updateOccurrenceSchedule = requireAsyncFunction(
          missions.updateOccurrenceSchedule,
          'missions.updateOccurrenceSchedule',
        );
        await updateOccurrenceSchedule(occurrenceA, {
          localStart: '12:00',
          localFinish: '13:00',
          startInstant: new Date('2026-09-03T04:00:00Z'),
          finishInstant: new Date('2026-09-03T05:00:00Z'),
        });
      }),
    ).rejects.toMatchObject({ name: 'TombstonedOccurrenceError' });
  });

  it('rolls back repository writes when transaction work fails', async () => {
    const { runInTransaction } = await loadRepositoryContract();
    const note = `rollback-${randomUUID()}`;

    await expect(
      runInTransaction(pool, accountA, async (repositories) => {
        const notes = requireRecord(repositories.notes, 'notes');
        const upsert = requireAsyncFunction(notes.upsert, 'notes.upsert');
        await upsert(rollbackOccurrenceA, note);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const persisted = await pool.query(
      `SELECT note FROM mission_personal_notes WHERE occurrence_id = $1 AND account_id = $2`,
      [rollbackOccurrenceA, accountA],
    );
    expect(persisted.rowCount).toBe(0);
  });
});
