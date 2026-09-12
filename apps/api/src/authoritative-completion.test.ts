import { randomUUID } from 'node:crypto';

import { applyMigrations } from '@misyra/database';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type CompletionType =
  'verified_on_time' | 'verified_late' | 'self_confirmed' | 'private' | 'trust_mode';

type CompletionResult = Readonly<{
  status: 'completed' | 'already_completed';
  occurrenceId: string;
  completionId: string;
  completionType: CompletionType;
  actionTime: string;
  reward: Readonly<{
    baseXp: number;
    proofBonusXp: number;
    awardedXp: number;
  }>;
  totalXp?: number;
}>;

type CompleteMissionAuthoritatively = (
  pool: Pool,
  input: Readonly<{
    accountId: string;
    occurrenceId: string;
    completionType: CompletionType;
    effectiveActionAt: string;
    deviceId: string;
    idempotencyKey: string;
  }>,
) => Promise<CompletionResult>;

type ApiModule = Record<string, unknown>;

async function loadCompletionTransaction(): Promise<CompleteMissionAuthoritatively> {
  const module = (await import('./index.js')) as ApiModule;
  const completion = module.completeMissionAuthoritatively;
  if (typeof completion !== 'function') {
    throw new TypeError('Missing required API function: completeMissionAuthoritatively');
  }
  return completion as CompleteMissionAuthoritatively;
}

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts058_${randomUUID().replaceAll('-', '')}`;
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
    [accountId, `mts058-${accountId}`],
  );
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

async function createOccurrence(input?: Readonly<{ expired?: boolean; tombstoned?: boolean }>) {
  const seriesId = randomUUID();
  const occurrenceId = randomUUID();
  const expired = input?.expired ?? false;
  const localDate = expired ? '2026-08-01' : '2026-09-12';
  const localStart = expired ? '2026-08-01T09:00:00' : '2026-09-12T09:00:00';
  const localFinish = expired ? '2026-08-01T10:00:00' : '2026-09-12T10:00:00';
  const startInstant = expired ? '2026-08-01T09:00:00Z' : '2026-09-12T09:00:00Z';
  const finishInstant = expired ? '2026-08-01T10:00:00Z' : '2026-09-12T10:00:00Z';

  await pool.query(`INSERT INTO mission_series (id, account_id, title) VALUES ($1, $2, $3)`, [
    seriesId,
    accountId,
    'Completion transaction mission',
  ]);
  await pool.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day, reward_eligibility
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'UTC', 'local_time', false, 'eligible')`,
    [
      occurrenceId,
      accountId,
      seriesId,
      localDate,
      localStart,
      localFinish,
      startInstant,
      finishInstant,
    ],
  );
  await pool.query(
    `INSERT INTO mission_reward_basis (occurrence_id, account_id, difficulty, base_xp)
     VALUES ($1, $2, 'normal', 100)`,
    [occurrenceId, accountId],
  );

  if (input?.tombstoned) {
    await pool.query(
      `INSERT INTO mission_occurrence_tombstones (occurrence_id, account_id, deleted_at, reason)
       VALUES ($1, $2, '2026-09-11T08:00:00Z', 'test')`,
      [occurrenceId, accountId],
    );
    await pool.query(
      `UPDATE mission_occurrences
       SET deletion_state = 'deleted',
           synchronization_state = 'synced',
           version = version + 1,
           updated_at = now()
       WHERE id = $1 AND account_id = $2`,
      [occurrenceId, accountId],
    );
  }

  return { seriesId, occurrenceId } as const;
}

async function countsFor(occurrenceId: string) {
  const [completion, reward, change, outbox] = await Promise.all([
    pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM mission_completions WHERE occurrence_id = $1`,
      [occurrenceId],
    ),
    pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM reward_ledger WHERE occurrence_id = $1`,
      [occurrenceId],
    ),
    pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM account_change_log WHERE account_id = $1 AND entity_id = $2`,
      [accountId, occurrenceId],
    ),
    pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM outbox_events WHERE account_id = $1 AND aggregate_id = $2`,
      [accountId, occurrenceId],
    ),
  ]);
  return {
    completion: completion.rows[0]?.count ?? 0,
    reward: reward.rows[0]?.count ?? 0,
    change: change.rows[0]?.count ?? 0,
    outbox: outbox.rows[0]?.count ?? 0,
  };
}

async function latestChangeFor(occurrenceId: string) {
  const result = await pool.query<{ entityType: string; operation: string; payload: unknown }>(
    `SELECT entity_type AS "entityType", operation, payload
       FROM account_change_log
      WHERE account_id = $1 AND entity_id = $2
      ORDER BY sequence DESC
      LIMIT 1`,
    [accountId, occurrenceId],
  );
  return result.rows[0] ?? null;
}

describe('MTS-058 authoritative completion transaction', () => {
  it('serializes concurrent completions so the first accepted completion wins exactly once', async () => {
    const completeMission = await loadCompletionTransaction();
    const { occurrenceId } = await createOccurrence();

    const results = await Promise.all([
      completeMission(pool, {
        accountId,
        occurrenceId,
        completionType: 'verified_on_time',
        effectiveActionAt: '2026-09-12T09:05:00.000Z',
        deviceId,
        idempotencyKey: randomUUID(),
      }),
      completeMission(pool, {
        accountId,
        occurrenceId,
        completionType: 'self_confirmed',
        effectiveActionAt: '2026-09-12T09:06:00.000Z',
        deviceId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'already_completed',
      'completed',
    ]);
    expect(new Set(results.map((result) => result.completionId)).size).toBe(1);
    await expect(countsFor(occurrenceId)).resolves.toEqual({
      completion: 1,
      reward: 1,
      change: 1,
      outbox: 1,
    });
  });

  it('replays the same idempotency key and returns a stable already-completed result for a new key', async () => {
    const completeMission = await loadCompletionTransaction();
    const { occurrenceId } = await createOccurrence();
    const idempotencyKey = randomUUID();
    const input = {
      accountId,
      occurrenceId,
      completionType: 'verified_on_time' as const,
      effectiveActionAt: '2026-09-12T09:05:00.000Z',
      deviceId,
      idempotencyKey,
    };

    const accepted = await completeMission(pool, input);
    await expect(completeMission(pool, input)).resolves.toEqual(accepted);

    const duplicate = await completeMission(pool, {
      ...input,
      idempotencyKey: randomUUID(),
      deviceId: randomUUID(),
    });
    expect(duplicate).toEqual({
      status: 'already_completed',
      occurrenceId: accepted.occurrenceId,
      completionId: accepted.completionId,
      completionType: accepted.completionType,
      actionTime: accepted.actionTime,
      reward: accepted.reward,
    });
    await expect(countsFor(occurrenceId)).resolves.toEqual({
      completion: 1,
      reward: 1,
      change: 1,
      outbox: 1,
    });
  });

  it('appends a mobile-consumable authoritative mission projection after completion', async () => {
    const completeMission = await loadCompletionTransaction();
    const { occurrenceId, seriesId } = await createOccurrence();

    await completeMission(pool, {
      accountId,
      occurrenceId,
      completionType: 'verified_on_time',
      effectiveActionAt: '2026-09-12T09:05:00.000Z',
      deviceId,
      idempotencyKey: randomUUID(),
    });

    await expect(latestChangeFor(occurrenceId)).resolves.toEqual({
      entityType: 'mission',
      operation: 'upsert',
      payload: {
        version: 2,
        series: {
          id: seriesId,
          title: 'Completion transaction mission',
          recurrence: null,
        },
        occurrence: {
          id: occurrenceId,
          seriesId,
          schedule: {
            localStart: '2026-09-12T09:00:00',
            localFinish: '2026-09-12T10:00:00',
            startInstant: '2026-09-12T09:00:00.000Z',
            finishInstant: '2026-09-12T10:00:00.000Z',
            timeZone: 'UTC',
            timeBehavior: 'local_time',
            allDay: false,
            estimatedEffortMinutes: null,
          },
          scheduleState: 'scheduled',
          completionState: 'completed',
          evidenceState: 'accepted',
          rewardEligibility: 'eligible',
          rewardIssuance: 'issued',
          calendarSource: 'internal',
          fieldOwnership: 'app_owned',
          synchronizationState: 'synced',
          storyState: 'none',
          deletionState: 'active',
        },
        location: null,
        notes: null,
      },
    });
  });

  it('rejects tombstoned and expired occurrences without issuing completion or reward state', async () => {
    const completeMission = await loadCompletionTransaction();
    const { occurrenceId: tombstonedId } = await createOccurrence({ tombstoned: true });
    const { occurrenceId: expiredId } = await createOccurrence({ expired: true });

    await expect(
      completeMission(pool, {
        accountId,
        occurrenceId: tombstonedId,
        completionType: 'self_confirmed',
        effectiveActionAt: '2026-09-12T09:05:00.000Z',
        deviceId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ name: 'CompletionRejectedError', reason: 'deleted' });

    await expect(
      completeMission(pool, {
        accountId,
        occurrenceId: expiredId,
        completionType: 'self_confirmed',
        effectiveActionAt: '2026-09-11T09:00:00.000Z',
        deviceId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ name: 'CompletionRejectedError', reason: 'expired' });

    await expect(countsFor(tombstonedId)).resolves.toEqual({
      completion: 0,
      reward: 0,
      change: 0,
      outbox: 0,
    });
    await expect(countsFor(expiredId)).resolves.toEqual({
      completion: 0,
      reward: 0,
      change: 0,
      outbox: 0,
    });
  });
});
