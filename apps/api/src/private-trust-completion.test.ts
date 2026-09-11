import { randomUUID } from 'node:crypto';

import { applyMigrations } from '@misyra/database';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CompletionRejectedError,
  completeMissionAuthoritatively,
} from './authoritative-completion.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts059_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

let pool: Pool;
let accountId: string;
let deviceId: string;

beforeAll(async () => {
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();
  await applyMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });
  accountId = randomUUID();
  deviceId = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, provider, provider_subject) VALUES ($1, 'google', $2)`,
    [accountId, `mts059-${accountId}`],
  );
  await pool.query(
    `INSERT INTO user_settings (account_id, language, trust_mode, app_time_zone)
     VALUES ($1, 'en', false, 'UTC')`,
    [accountId],
  );
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

async function createOccurrence(evidenceState = 'not_submitted') {
  const seriesId = randomUUID();
  const occurrenceId = randomUUID();
  await pool.query(`INSERT INTO mission_series (id, account_id, title) VALUES ($1, $2, 'No evidence')`, [
    seriesId,
    accountId,
  ]);
  await pool.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day,
       reward_eligibility, evidence_state
     ) VALUES (
       $1, $2, $3, '2026-09-12', '2026-09-12T09:00:00', '2026-09-12T10:00:00',
       '2026-09-12T09:00:00Z', '2026-09-12T10:00:00Z', 'UTC', 'local_time', false,
       'eligible', $4
     )`,
    [occurrenceId, accountId, seriesId, evidenceState],
  );
  await pool.query(
    `INSERT INTO mission_reward_basis (occurrence_id, account_id, difficulty, base_xp)
     VALUES ($1, $2, 'normal', 100)`,
    [occurrenceId, accountId],
  );
  return occurrenceId;
}

async function complete(occurrenceId: string, completionType: 'private' | 'trust_mode') {
  return completeMissionAuthoritatively(pool, {
    accountId,
    occurrenceId,
    completionType,
    effectiveActionAt: '2026-09-12T09:05:00.000Z',
    deviceId,
    idempotencyKey: randomUUID(),
  });
}

async function stateFor(occurrenceId: string) {
  const occurrence = await pool.query<{
    completionState: string;
    evidenceState: string;
    rewardIssuance: string;
  }>(
    `SELECT completion_state AS "completionState",
            evidence_state AS "evidenceState",
            reward_issuance AS "rewardIssuance"
       FROM mission_occurrences
      WHERE id = $1 AND account_id = $2`,
    [occurrenceId, accountId],
  );
  const reward = await pool.query<{ baseXp: number; proofBonusXp: number; awardedXp: number }>(
    `SELECT base_xp AS "baseXp", proof_bonus_xp AS "proofBonusXp", awarded_xp AS "awardedXp"
       FROM reward_ledger
      WHERE occurrence_id = $1 AND account_id = $2`,
    [occurrenceId, accountId],
  );
  const streak = await pool.query<{ state: string }>(
    `SELECT state FROM streak_days WHERE account_id = $1 AND local_date = '2026-09-12'`,
    [accountId],
  );
  return {
    occurrence: occurrence.rows[0] ?? null,
    reward: reward.rows[0] ?? null,
    streak: streak.rows[0]?.state ?? null,
  };
}

describe('MTS-059 Private and Trust Mode authoritative completion', () => {
  it('allows Private before the first evidence submission and awards base XP with streak credit', async () => {
    const occurrenceId = await createOccurrence();

    await expect(complete(occurrenceId, 'private')).resolves.toMatchObject({
      status: 'completed',
      completionType: 'private',
      reward: { baseXp: 100, proofBonusXp: 0, awardedXp: 100 },
    });
    await expect(stateFor(occurrenceId)).resolves.toEqual({
      occurrence: {
        completionState: 'completed',
        evidenceState: 'not_required',
        rewardIssuance: 'issued',
      },
      reward: { baseXp: 100, proofBonusXp: 0, awardedXp: 100 },
      streak: 'continued',
    });
  });

  it('locks Private after the first evidence submission', async () => {
    const occurrenceId = await createOccurrence('rejected');
    await pool.query(
      `INSERT INTO evidence_attempts
        (account_id, occurrence_id, attempt_number, status, submitted_at)
       VALUES ($1, $2, 1, 'rejected', '2026-09-12T09:03:00Z')`,
      [accountId, occurrenceId],
    );

    await expect(complete(occurrenceId, 'private')).rejects.toMatchObject({
      name: 'CompletionRejectedError',
      reason: 'completion_mode_not_allowed',
    } satisfies Partial<CompletionRejectedError>);
    await expect(stateFor(occurrenceId)).resolves.toEqual({
      occurrence: {
        completionState: 'incomplete',
        evidenceState: 'rejected',
        rewardIssuance: 'not_issued',
      },
      reward: null,
      streak: 'continued',
    });
  });

  it('requires global Trust Mode and refuses an active evidence flow', async () => {
    const disabledId = await createOccurrence();
    await expect(complete(disabledId, 'trust_mode')).rejects.toMatchObject({
      name: 'CompletionRejectedError',
      reason: 'completion_mode_not_allowed',
    } satisfies Partial<CompletionRejectedError>);

    await pool.query(`UPDATE user_settings SET trust_mode = true WHERE account_id = $1`, [accountId]);
    const pendingId = await createOccurrence('pending');
    await expect(complete(pendingId, 'trust_mode')).rejects.toMatchObject({
      name: 'CompletionRejectedError',
      reason: 'completion_mode_not_allowed',
    } satisfies Partial<CompletionRejectedError>);

    const trustId = await createOccurrence('rejected');
    await expect(complete(trustId, 'trust_mode')).resolves.toMatchObject({
      completionType: 'trust_mode',
      reward: { baseXp: 100, proofBonusXp: 0, awardedXp: 100 },
    });
    await expect(stateFor(trustId)).resolves.toMatchObject({
      occurrence: { completionState: 'completed', evidenceState: 'not_required' },
      reward: { baseXp: 100, proofBonusXp: 0, awardedXp: 100 },
      streak: 'continued',
    });
  });
});
