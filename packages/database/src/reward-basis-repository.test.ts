import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations, createRewardBasisStore, runRewardBasisTransaction } from './index.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts057_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

let pool: Pool;
let accountId: string;
let occurrenceId: string;

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
    const outsideStore = createRewardBasisStore(pool, accountId);

    await expect(
      outsideStore.upsertBasis(occurrenceId, { difficulty: 'hard', baseXp: 170 }),
    ).rejects.toMatchObject({ name: 'TransactionRequiredError' });

    await runRewardBasisTransaction(pool, accountId, async (store) => {
      await expect(
        store.upsertBasis(occurrenceId, { difficulty: 'hard', baseXp: 170 }),
      ).resolves.toMatchObject({
        occurrenceId,
        accountId,
        difficulty: 'hard',
        baseXp: 170,
        revokedAt: null,
      });
    });

    await expect(outsideStore.findBasisByOccurrenceId(occurrenceId)).resolves.toMatchObject({
      difficulty: 'hard',
      baseXp: 170,
      revokedAt: null,
    });

    await expect(
      createRewardBasisStore(pool, randomUUID()).findBasisByOccurrenceId(occurrenceId),
    ).resolves.toBeNull();
  });

  it('revokes to zero idempotently and never allows an eligible basis to be restored', async () => {
    const revokedAt = new Date('2026-09-12T09:01:00.000Z');

    await runRewardBasisTransaction(pool, accountId, async (store) => {
      await expect(store.revokeBasis(occurrenceId, revokedAt)).resolves.toMatchObject({
        difficulty: 'hard',
        baseXp: 0,
        revokedAt,
      });
      await expect(
        store.revokeBasis(occurrenceId, new Date('2026-09-12T09:02:00.000Z')),
      ).resolves.toMatchObject({
        baseXp: 0,
        revokedAt,
      });
    });

    await expect(
      runRewardBasisTransaction(pool, accountId, async (store) => {
        await store.upsertBasis(occurrenceId, { difficulty: 'easy', baseXp: 50 });
      }),
    ).rejects.toMatchObject({ name: 'RewardBasisRevokedError' });

    await expect(
      createRewardBasisStore(pool, accountId).findBasisByOccurrenceId(occurrenceId),
    ).resolves.toMatchObject({
      difficulty: 'hard',
      baseXp: 0,
      revokedAt,
    });
  });
});
