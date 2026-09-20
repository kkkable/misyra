import { randomUUID } from 'node:crypto';

import { applyMigrations } from '@misyra/database';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApplication } from './application.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts082_${randomUUID().replaceAll('-', '')}`;
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
    [accountId, `mts082-${accountId}`],
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

async function createOccurrence(day: number, evidenceState: 'rejected' | 'pending' = 'rejected') {
  const seriesId = randomUUID();
  const occurrenceId = randomUUID();
  const date = `2026-09-${String(day).padStart(2, '0')}`;
  await pool.query(
    `INSERT INTO mission_series (id, account_id, title)
     VALUES ($1, $2, 'Evidence self confirm')`,
    [seriesId, accountId],
  );
  await pool.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day,
       reward_eligibility, evidence_state
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, 'UTC', 'local_time', false,
       'eligible', $9
     )`,
    [
      occurrenceId,
      accountId,
      seriesId,
      date,
      `${date}T09:00:00`,
      `${date}T10:00:00`,
      `${date}T09:00:00Z`,
      `${date}T10:00:00Z`,
      evidenceState,
    ],
  );
  await pool.query(
    `INSERT INTO mission_reward_basis (occurrence_id, account_id, difficulty, base_xp)
     VALUES ($1, $2, 'normal', 100)`,
    [occurrenceId, accountId],
  );
  return { occurrenceId, date } as const;
}

async function insertAttempt(
  occurrenceId: string,
  date: string,
  verificationStatus: 'rejected' | 'queued',
  attemptNumber = 1,
) {
  const attemptId = randomUUID();
  const rejected = verificationStatus === 'rejected';
  await pool.query(
    `INSERT INTO evidence_attempts (
       id, account_id, occurrence_id, attempt_number, status, submitted_at,
       first_submitted_at, effective_submitted_at, upload_status,
       verification_status, reason_code, deletion_deadline
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $6, $6, 'uploaded',
       $7, $8, $9
     )`,
    [
      attemptId,
      accountId,
      occurrenceId,
      attemptNumber,
      rejected ? 'rejected' : 'pending',
      `${date}T10:11:00Z`,
      verificationStatus,
      rejected ? 'task_mismatch' : null,
      '2026-11-30T00:00:00Z',
    ],
  );
  return attemptId;
}

function createServer(now = '2026-09-20T10:15:00.000Z') {
  return createApiApplication({
    pool,
    expectedAudience: { apple: 'apple-audience', google: 'google-audience' },
    issueAccessToken: () => 'fixture-access-token',
    reauthenticationProofSecret: 'fixture-reauthentication-proof-secret',
    authenticate: () => ({ accountId }),
    now: () => new Date(now),
  });
}

async function selfConfirm(
  occurrenceId: string,
  evidenceAttemptId: string | undefined,
  effectiveActionAt: string,
  serverNow = effectiveActionAt,
) {
  const server = createServer(serverNow);
  const response = await server.inject({
    method: 'POST',
    url: `/v1/missions/${occurrenceId}/complete`,
    payload: {
      completionMode: 'self_confirmed',
      effectiveActionAt,
      ...(evidenceAttemptId === undefined ? {} : { evidenceAttemptId }),
      deviceId,
      idempotencyKey: randomUUID(),
    },
  });
  await server.close();
  return response;
}

describe('MTS-082 evidence self-confirmation', () => {
  it('double-confirmed self-confirm reaches the authoritative path with base XP and keeps rejected evidence yellow', async () => {
    const mission = await createOccurrence(20);
    const attemptId = await insertAttempt(mission.occurrenceId, mission.date, 'rejected');

    const response = await selfConfirm(
      mission.occurrenceId,
      attemptId,
      `${mission.date}T10:15:00.000Z`,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      payload: {
        completionType: 'self_confirmed',
        reward: { baseXp: 100, proofBonusXp: 0, awardedXp: 100 },
      },
    });

    const stored = await pool.query<{
      completionState: string;
      evidenceState: string;
      rewardIssuance: string;
    }>(
      `SELECT completion_state AS "completionState",
              evidence_state AS "evidenceState",
              reward_issuance AS "rewardIssuance"
         FROM mission_occurrences
        WHERE id = $1 AND account_id = $2`,
      [mission.occurrenceId, accountId],
    );
    expect(stored.rows[0]).toEqual({
      completionState: 'completed',
      evidenceState: 'rejected',
      rewardIssuance: 'issued',
    });
  });

  it('requires a rejected evidence attempt and refuses self-confirm while verification is still active', async () => {
    const missing = await createOccurrence(21);
    const missingResponse = await selfConfirm(
      missing.occurrenceId,
      undefined,
      `${missing.date}T10:15:00.000Z`,
    );
    expect(missingResponse.statusCode).toBe(409);
    expect(missingResponse.json()).toMatchObject({ error: { code: 'conflict' } });

    const pending = await createOccurrence(22, 'pending');
    const pendingAttemptId = await insertAttempt(pending.occurrenceId, pending.date, 'queued');
    const pendingResponse = await selfConfirm(
      pending.occurrenceId,
      pendingAttemptId,
      `${pending.date}T10:15:00.000Z`,
    );
    expect(pendingResponse.statusCode).toBe(409);
    expect(pendingResponse.json()).toMatchObject({ error: { code: 'conflict' } });
  });

  it('returns only controlled result state and locks actions after server-side expiry', async () => {
    const mission = await createOccurrence(24);
    const attemptId = await insertAttempt(mission.occurrenceId, mission.date, 'rejected');

    const openServer = createServer('2026-09-24T10:20:00.000Z');
    const openResult = await openServer.inject({
      method: 'GET',
      url: `/v1/evidence/attempts/${attemptId}`,
    });
    await openServer.close();

    expect(openResult.statusCode).toBe(200);
    expect(openResult.json()).toMatchObject({
      payload: {
        attemptId,
        occurrenceId: mission.occurrenceId,
        attemptNumber: 1,
        verificationStatus: 'rejected',
        reasonCode: 'task_mismatch',
        expired: false,
        serverNow: '2026-09-24T10:20:00.000Z',
        expiresAt: '2026-10-24T10:00:00.000Z',
      },
    });
    expect(JSON.stringify(openResult.json())).not.toContain('model');

    const expiredServer = createServer('2026-10-24T10:00:00.000Z');
    const expiredResult = await expiredServer.inject({
      method: 'GET',
      url: `/v1/evidence/attempts/${attemptId}`,
    });
    await expiredServer.close();

    expect(expiredResult.statusCode).toBe(200);
    expect(expiredResult.json()).toMatchObject({
      payload: { verificationStatus: 'rejected', expired: true },
    });
  });

  it('returns the latest durable attempt so rejected flows can resume after remount', async () => {
    const mission = await createOccurrence(25);
    await insertAttempt(mission.occurrenceId, mission.date, 'rejected', 1);
    const latestAttemptId = await insertAttempt(mission.occurrenceId, mission.date, 'rejected', 2);

    const server = createServer('2026-09-25T10:20:00.000Z');
    const response = await server.inject({
      method: 'GET',
      url: `/v1/evidence/occurrences/${mission.occurrenceId}/latest-attempt`,
    });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      payload: { attemptId: latestAttemptId },
    });
  });

  it('has no expired escape path after a rejected verification', async () => {
    const mission = await createOccurrence(23);
    const attemptId = await insertAttempt(mission.occurrenceId, mission.date, 'rejected');

    const response = await selfConfirm(
      mission.occurrenceId,
      attemptId,
      '2026-09-23T10:15:00.000Z',
      '2026-10-23T10:00:00.000Z',
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: 'completion_window_expired' },
    });
  });
});
