import { randomUUID } from 'node:crypto';

import { applyMigrations } from '@misyra/database';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiApplication } from './application.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts080_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

let pool: Pool;
let accountId: string;
let apiNow = new Date('2026-09-18T10:00:00.000Z');

type AttemptPayload = Readonly<{
  attemptId: string;
  occurrenceId: string;
  attemptNumber: number;
  firstSubmittedAt: string;
  effectiveSubmittedAt: string;
  mediaAssetId: string;
  uploadPath: string;
  expiresAt: string;
}>;

async function seedOccurrence(
  input: Readonly<{
    finishAt?: string;
    completed?: boolean;
  }> = {},
) {
  const seriesId = randomUUID();
  const occurrenceId = randomUUID();
  const finishAt = input.finishAt ?? '2026-09-18T09:00:00.000Z';
  const startAt = new Date(new Date(finishAt).getTime() - 60 * 60 * 1_000).toISOString();
  const localDate = finishAt.slice(0, 10);
  const localStart = startAt.replace(/\.\d{3}Z$/, '');
  const localFinish = finishAt.replace(/\.\d{3}Z$/, '');

  await pool.query(
    `INSERT INTO mission_series (id, account_id, title)
     VALUES ($1, $2, 'MTS-080 evidence mission')`,
    [seriesId, accountId],
  );
  await pool.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day,
       completion_state
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, 'UTC', 'fixed_instant', false, $9
     )`,
    [
      occurrenceId,
      accountId,
      seriesId,
      localDate,
      localStart,
      localFinish,
      startAt,
      finishAt,
      input.completed === true ? 'completed' : 'incomplete',
    ],
  );

  if (input.completed === true) {
    await pool.query(
      `INSERT INTO mission_completions
         (id, account_id, occurrence_id, completion_type, action_time)
       VALUES ($1, $2, $3, 'verified', $4)`,
      [randomUUID(), accountId, occurrenceId, startAt],
    );
  }

  return occurrenceId;
}

function createServer(
  blobStore: Readonly<{
    put?: (
      container: string,
      storageKey: string,
      bytes: Buffer,
      contentType: string,
    ) => Promise<void>;
    get?: (container: string, storageKey: string) => Promise<Buffer>;
    delete?: (container: string, storageKey: string) => Promise<void>;
  }> = {},
) {
  return createApiApplication({
    pool,
    expectedAudience: { apple: 'apple-audience', google: 'google-audience' },
    issueAccessToken: () => 'fixture-access-token',
    reauthenticationProofSecret: 'fixture-reauthentication-proof-secret',
    now: () => apiNow,
    authenticate: () => ({ accountId }),
    mediaBlobStore: {
      put: blobStore.put ?? vi.fn(() => Promise.resolve()),
      get: blobStore.get ?? vi.fn(() => Promise.resolve(Buffer.from('evidence-image'))),
      delete: blobStore.delete ?? vi.fn(() => Promise.resolve()),
    },
  });
}

async function reserveAttempt(
  server: ReturnType<typeof createApiApplication>,
  occurrenceId: string,
  attemptId: string,
  submittedAt: string,
) {
  const response = await server.inject({
    method: 'POST',
    url: `/v1/evidence/occurrences/${occurrenceId}/attempts`,
    payload: {
      attemptId,
      submittedAt,
      contentType: 'image/jpeg',
    },
  });
  return {
    response,
    payload:
      response.statusCode === 200 ? response.json<{ payload: AttemptPayload }>().payload : null,
  };
}

beforeAll(async () => {
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();
  await applyMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });
  accountId = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, provider, provider_subject)
     VALUES ($1, 'google', $2)`,
    [accountId, `mts080-${accountId}`],
  );
});

beforeEach(() => {
  apiNow = new Date('2026-09-18T10:00:00.000Z');
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

describe('MTS-080 evidence-attempt creation and upload', () => {
  it('preserves the exact first/effective submit timestamps before upload and queues verification only after upload', async () => {
    const server = createServer();
    const occurrenceId = await seedOccurrence();
    const attemptId = randomUUID();
    const submittedAt = '2026-09-18T09:03:45.678Z';

    const reserved = await reserveAttempt(server, occurrenceId, attemptId, submittedAt);

    expect(reserved.response.statusCode).toBe(200);
    expect(reserved.payload).toMatchObject({
      attemptId,
      occurrenceId,
      attemptNumber: 1,
      firstSubmittedAt: submittedAt,
      effectiveSubmittedAt: submittedAt,
    });
    expect(reserved.payload?.uploadPath).toMatch(/^\/v1\/media\/uploads\//);

    const beforeUpload = await pool.query<{
      firstSubmittedAt: Date;
      effectiveSubmittedAt: Date;
      uploadStatus: string;
      verificationStatus: string;
      reasonCode: string | null;
      mediaAssetId: string;
      deletionDeadline: Date;
    }>(
      `SELECT
         first_submitted_at AS "firstSubmittedAt",
         effective_submitted_at AS "effectiveSubmittedAt",
         upload_status AS "uploadStatus",
         verification_status AS "verificationStatus",
         reason_code AS "reasonCode",
         media_asset_id AS "mediaAssetId",
         deletion_deadline AS "deletionDeadline"
       FROM evidence_attempts
       WHERE id = $1 AND account_id = $2`,
      [attemptId, accountId],
    );
    expect(beforeUpload.rows[0]?.firstSubmittedAt.toISOString()).toBe(submittedAt);
    expect(beforeUpload.rows[0]?.effectiveSubmittedAt.toISOString()).toBe(submittedAt);
    expect(beforeUpload.rows[0]).toMatchObject({
      uploadStatus: 'pending',
      verificationStatus: 'pending',
      reasonCode: null,
      mediaAssetId: reserved.payload?.mediaAssetId,
    });
    expect(beforeUpload.rows[0]?.deletionDeadline.toISOString()).toBe('2026-10-18T10:00:00.000Z');

    const beforeOutbox = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM outbox_events
       WHERE aggregate_type = 'evidence_attempt' AND aggregate_id = $1`,
      [attemptId],
    );
    expect(beforeOutbox.rows[0]?.count).toBe('0');

    const upload = await server.inject({
      method: 'PUT',
      url: reserved.payload?.uploadPath ?? '/missing-upload-path',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('evidence-image'),
    });
    expect(upload.statusCode).toBe(200);

    const afterUpload = await pool.query<{
      uploadStatus: string;
      verificationStatus: string;
    }>(
      `SELECT upload_status AS "uploadStatus", verification_status AS "verificationStatus"
       FROM evidence_attempts
       WHERE id = $1 AND account_id = $2`,
      [attemptId, accountId],
    );
    expect(afterUpload.rows[0]).toEqual({
      uploadStatus: 'uploaded',
      verificationStatus: 'queued',
    });

    const outbox = await pool.query<{
      eventType: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT event_type AS "eventType", payload
       FROM outbox_events
       WHERE aggregate_type = 'evidence_attempt' AND aggregate_id = $1`,
      [attemptId],
    );
    expect(outbox.rows).toHaveLength(1);
    expect(outbox.rows[0]).toMatchObject({
      eventType: 'evidence.verification.requested',
      payload: {
        attemptId,
        occurrenceId,
        mediaAssetId: reserved.payload?.mediaAssetId,
      },
    });
    expect(JSON.stringify(outbox.rows[0]?.payload)).not.toContain('notes');

    await server.close();
  });

  it('keeps the first submit timestamp across retries while recording each effective submit time', async () => {
    const server = createServer();
    const occurrenceId = await seedOccurrence();
    const firstId = randomUUID();
    const secondId = randomUUID();
    const firstSubmittedAt = '2026-09-18T09:04:00.000Z';
    const retrySubmittedAt = '2026-09-18T09:20:00.000Z';

    const first = await reserveAttempt(server, occurrenceId, firstId, firstSubmittedAt);
    const second = await reserveAttempt(server, occurrenceId, secondId, retrySubmittedAt);

    expect(first.response.statusCode).toBe(200);
    expect(second.response.statusCode).toBe(200);
    expect(second.payload).toMatchObject({
      attemptNumber: 2,
      firstSubmittedAt,
      effectiveSubmittedAt: retrySubmittedAt,
    });

    await server.close();
  });

  it('counts a delayed offline submit using its preserved pre-expiry action time', async () => {
    const server = createServer();
    const occurrenceId = await seedOccurrence({ finishAt: '2026-09-18T09:00:00.000Z' });
    apiNow = new Date('2026-10-20T12:00:00.000Z');
    const submittedBeforeExpiry = '2026-10-18T08:59:59.999Z';

    const result = await reserveAttempt(server, occurrenceId, randomUUID(), submittedBeforeExpiry);

    expect(result.response.statusCode).toBe(200);
    expect(result.payload).toMatchObject({
      attemptNumber: 1,
      firstSubmittedAt: submittedBeforeExpiry,
      effectiveSubmittedAt: submittedBeforeExpiry,
    });

    const count = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM evidence_attempts WHERE occurrence_id = $1',
      [occurrenceId],
    );
    expect(count.rows[0]?.count).toBe('1');

    await server.close();
  });

  it('enforces the maximum three attempts under concurrent server reservation', async () => {
    const server = createServer();
    const occurrenceId = await seedOccurrence();
    const submittedAt = '2026-09-18T09:05:00.000Z';

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        reserveAttempt(server, occurrenceId, randomUUID(), submittedAt),
      ),
    );

    expect(results.filter(({ response }) => response.statusCode === 200)).toHaveLength(3);
    const rejected = results.filter(({ response }) => response.statusCode !== 200);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.response.statusCode).toBe(409);
    expect(rejected[0]?.response.json()).toMatchObject({
      error: { code: 'evidence_attempt_limit' },
    });

    const attempts = await pool.query<{ attemptNumber: number }>(
      `SELECT attempt_number AS "attemptNumber"
       FROM evidence_attempts
       WHERE occurrence_id = $1
       ORDER BY attempt_number`,
      [occurrenceId],
    );
    expect(attempts.rows).toEqual([
      { attemptNumber: 1 },
      { attemptNumber: 2 },
      { attemptNumber: 3 },
    ]);

    await server.close();
  });

  it('rejects attempts at the exact expiry boundary and after an accepted completion', async () => {
    const server = createServer();
    const expiredOccurrenceId = await seedOccurrence({
      finishAt: '2026-08-19T10:00:00.000Z',
    });
    const completedOccurrenceId = await seedOccurrence({ completed: true });

    const expired = await reserveAttempt(
      server,
      expiredOccurrenceId,
      randomUUID(),
      '2026-09-18T10:00:00.000Z',
    );
    const completed = await reserveAttempt(
      server,
      completedOccurrenceId,
      randomUUID(),
      '2026-09-18T09:01:00.000Z',
    );

    expect(expired.response.statusCode).toBe(409);
    expect(expired.response.json()).toMatchObject({
      error: { code: 'completion_window_expired' },
    });
    expect(completed.response.statusCode).toBe(409);
    expect(completed.response.json()).toMatchObject({
      error: { code: 'already_completed' },
    });

    await server.close();
  });

  it('silently replaces an invalid device clock with the first server receipt time', async () => {
    const server = createServer();
    const occurrenceId = await seedOccurrence();
    apiNow = new Date('2026-09-20T09:30:00.000Z');

    const result = await reserveAttempt(
      server,
      occurrenceId,
      randomUUID(),
      'not-a-valid-device-timestamp',
    );

    expect(result.response.statusCode).toBe(200);
    expect(result.payload).toMatchObject({
      attemptNumber: 1,
      firstSubmittedAt: '2026-09-20T09:30:00.000Z',
      effectiveSubmittedAt: '2026-09-20T09:30:00.000Z',
    });

    await server.close();
  });

  it('early-deletes every app-controlled evidence copy while preserving completion and XP history', async () => {
    const deleteBlob = vi.fn(() => Promise.resolve());
    const server = createServer({
      put: vi.fn(() => Promise.resolve()),
      delete: deleteBlob,
    });
    const occurrenceId = await seedOccurrence({ completed: true });
    const attemptId = randomUUID();
    const mediaAssetId = randomUUID();
    const original = `${accountId}/${mediaAssetId}/original`;
    const thumbnail = `${accountId}/${mediaAssetId}/thumbnail`;
    const derivative = `${accountId}/${mediaAssetId}/derivative`;
    const temporary = `${accountId}/${mediaAssetId}/temporary`;

    await pool.query(
      `INSERT INTO media_assets (
         id, account_id, purpose, storage_key, original_storage_key,
         thumbnail_storage_key, derivative_storage_key, temporary_storage_key,
         deletion_due_at, deletion_state, retry_state
       ) VALUES (
         $1, $2, 'evidence-working', $3, $3,
         $4, $5, $6,
         '2026-10-20T09:30:00.000Z', 'active', 'ready'
       )`,
      [mediaAssetId, accountId, original, thumbnail, derivative, temporary],
    );
    await pool.query(
      `INSERT INTO evidence_attempts (
         id, account_id, occurrence_id, attempt_number, status, submitted_at,
         first_submitted_at, effective_submitted_at, upload_status,
         verification_status, reason_code, media_asset_id, deletion_deadline
       ) VALUES (
         $1, $2, $3, 1, 'accepted', '2026-09-18T09:01:00.000Z',
         '2026-09-18T09:01:00.000Z', '2026-09-18T09:01:00.000Z', 'uploaded',
         'accepted', 'verified', $4, '2026-10-20T09:30:00.000Z'
       )`,
      [attemptId, accountId, occurrenceId, mediaAssetId],
    );
    await pool.query(
      `INSERT INTO reward_ledger
         (account_id, occurrence_id, base_xp, proof_bonus_xp, awarded_xp)
       VALUES ($1, $2, 100, 15, 115)`,
      [accountId, occurrenceId],
    );

    const before = await pool.query<{
      completionCount: number;
      rewardCount: number;
      awardedXp: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int
            FROM mission_completions
           WHERE account_id = $1 AND occurrence_id = $2) AS "completionCount",
         (SELECT COUNT(*)::int
            FROM reward_ledger
           WHERE account_id = $1 AND occurrence_id = $2) AS "rewardCount",
         (SELECT awarded_xp
            FROM reward_ledger
           WHERE account_id = $1 AND occurrence_id = $2) AS "awardedXp"`,
      [accountId, occurrenceId],
    );

    const deleted = await server.inject({
      method: 'DELETE',
      url: `/v1/evidence/attempts/${attemptId}/media`,
    });

    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({ payload: { deleted: true } });
    expect(deleteBlob.mock.calls).toEqual([
      ['evidence-working', original],
      ['evidence-working', thumbnail],
      ['evidence-working', derivative],
      ['evidence-working', temporary],
    ]);

    const asset = await pool.query<{ deletionState: string; retryState: string }>(
      `SELECT deletion_state AS "deletionState", retry_state AS "retryState"
         FROM media_assets
        WHERE id = $1 AND account_id = $2`,
      [mediaAssetId, accountId],
    );
    expect(asset.rows[0]).toEqual({ deletionState: 'deleted', retryState: 'ready' });

    const after = await pool.query<{
      completionCount: number;
      rewardCount: number;
      awardedXp: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int
            FROM mission_completions
           WHERE account_id = $1 AND occurrence_id = $2) AS "completionCount",
         (SELECT COUNT(*)::int
            FROM reward_ledger
           WHERE account_id = $1 AND occurrence_id = $2) AS "rewardCount",
         (SELECT awarded_xp
            FROM reward_ledger
           WHERE account_id = $1 AND occurrence_id = $2) AS "awardedXp"`,
      [accountId, occurrenceId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);

    await server.close();
  });

  it('does not lose or double-consume an attempt when media upload fails and reservation is retried', async () => {
    const failingPut = vi.fn(() => Promise.reject(new Error('fixture upload unavailable')));
    const failingServer = createServer({
      put: failingPut,
      delete: vi.fn(() => Promise.resolve()),
    });
    const occurrenceId = await seedOccurrence();
    const attemptId = randomUUID();
    const submittedAt = '2026-09-18T09:06:00.000Z';

    const reserved = await reserveAttempt(failingServer, occurrenceId, attemptId, submittedAt);
    expect(reserved.response.statusCode).toBe(200);

    const failedUpload = await failingServer.inject({
      method: 'PUT',
      url: reserved.payload?.uploadPath ?? '/missing-upload-path',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('evidence-image'),
    });
    expect(failedUpload.statusCode).toBe(503);

    const retained = await pool.query<{
      attemptNumber: number;
      uploadStatus: string;
      verificationStatus: string;
    }>(
      `SELECT
         attempt_number AS "attemptNumber",
         upload_status AS "uploadStatus",
         verification_status AS "verificationStatus"
       FROM evidence_attempts
       WHERE id = $1 AND account_id = $2`,
      [attemptId, accountId],
    );
    expect(retained.rows[0]).toEqual({
      attemptNumber: 1,
      uploadStatus: 'pending',
      verificationStatus: 'pending',
    });
    await failingServer.close();

    const succeedingPut = vi.fn(() => Promise.resolve());
    const succeedingServer = createServer({
      put: succeedingPut,
      delete: vi.fn(() => Promise.resolve()),
    });
    const replay = await reserveAttempt(succeedingServer, occurrenceId, attemptId, submittedAt);

    expect(replay.response.statusCode).toBe(200);
    expect(replay.payload).toMatchObject({
      attemptId,
      attemptNumber: 1,
      firstSubmittedAt: submittedAt,
      effectiveSubmittedAt: submittedAt,
      mediaAssetId: reserved.payload?.mediaAssetId,
    });
    const count = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM evidence_attempts WHERE occurrence_id = $1',
      [occurrenceId],
    );
    expect(count.rows[0]?.count).toBe('1');

    const upload = await succeedingServer.inject({
      method: 'PUT',
      url: replay.payload?.uploadPath ?? '/missing-upload-path',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('evidence-image'),
    });
    expect(upload.statusCode).toBe(200);
    expect(succeedingPut).toHaveBeenCalledTimes(1);

    const outbox = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM outbox_events
       WHERE aggregate_type = 'evidence_attempt' AND aggregate_id = $1`,
      [attemptId],
    );
    expect(outbox.rows[0]?.count).toBe('1');

    await succeedingServer.close();
  });
});
