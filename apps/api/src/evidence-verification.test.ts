import { randomUUID } from 'node:crypto';

import { applyMigrations, type ClaimedOutboxEvent } from '@misyra/database';
import type { EvidenceVerificationGatewayRequest } from '@misyra/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createEvidenceVerificationService } from './evidence-verification.js';

const postgresUser = process.env.POSTGRES_USER ?? 'misyra';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? 'misyra-local-only';
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const databaseName = `misyra_mts081_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const adminUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/postgres`;

let pool: Pool;
let accountId: string;

type SeededAttempt = Readonly<{
  attemptId: string;
  occurrenceId: string;
  mediaAssetId: string;
  firstSubmittedAt: string;
  effectiveSubmittedAt: string;
  event: ClaimedOutboxEvent;
}>;

async function seedQueuedAttempt(
  input: Readonly<{ attemptNumber?: 1 | 2 }> = {},
): Promise<SeededAttempt> {
  const attemptNumber = input.attemptNumber ?? 1;
  const seriesId = randomUUID();
  const occurrenceId = randomUUID();
  const mediaAssetId = randomUUID();
  const attemptId = randomUUID();
  const firstSubmittedAt = '2026-09-19T09:04:00.000Z';
  const effectiveSubmittedAt = attemptNumber === 1 ? firstSubmittedAt : '2026-09-19T09:20:00.000Z';

  await pool.query(
    `INSERT INTO mission_series (id, account_id, title)
     VALUES ($1, $2, 'Organizer meeting')`,
    [seriesId, accountId],
  );
  await pool.query(
    `INSERT INTO mission_occurrences (
       id, account_id, series_id, local_date, local_start, local_finish,
       start_instant, finish_instant, time_zone, time_behavior, all_day,
       completion_state, evidence_state, notes
     ) VALUES (
       $1, $2, $3, '2026-09-19', '2026-09-19T09:00:00', '2026-09-19T10:00:00',
       '2026-09-19T01:00:00.000Z', '2026-09-19T02:00:00.000Z',
       'Asia/Hong_Kong', 'fixed_instant', false, 'incomplete', 'pending', 'Organizer agenda'
     )`,
    [occurrenceId, accountId, seriesId],
  );
  await pool.query(
    `INSERT INTO mission_personal_notes (occurrence_id, account_id, note)
     VALUES ($1, $2, 'Private note that must never reach AI verification')`,
    [occurrenceId, accountId],
  );
  await pool.query(
    `INSERT INTO media_assets (
       id, account_id, purpose, storage_key, original_storage_key, deletion_due_at
     ) VALUES ($1, $2, 'evidence-working', $3, $3, '2026-10-19T09:04:00.000Z')`,
    [mediaAssetId, accountId, `${accountId}/${mediaAssetId}/original`],
  );

  if (attemptNumber === 2) {
    const priorAssetId = randomUUID();
    await pool.query(
      `INSERT INTO media_assets (
         id, account_id, purpose, storage_key, original_storage_key, deletion_due_at
       ) VALUES ($1, $2, 'evidence-working', $3, $3, '2026-10-19T09:04:00.000Z')`,
      [priorAssetId, accountId, `${accountId}/${priorAssetId}/original`],
    );
    await pool.query(
      `INSERT INTO evidence_attempts (
         id, account_id, occurrence_id, attempt_number, status, submitted_at,
         first_submitted_at, effective_submitted_at, upload_status,
         verification_status, reason_code, media_asset_id, deletion_deadline
       ) VALUES (
         $1, $2, $3, 1, 'rejected', $4,
         $4, $4, 'uploaded', 'rejected', 'task_not_evident', $5, $6
       )`,
      [
        randomUUID(),
        accountId,
        occurrenceId,
        firstSubmittedAt,
        priorAssetId,
        '2026-10-19T09:04:00.000Z',
      ],
    );
  }

  await pool.query(
    `INSERT INTO evidence_attempts (
       id, account_id, occurrence_id, attempt_number, status, submitted_at,
       first_submitted_at, effective_submitted_at, upload_status,
       verification_status, reason_code, media_asset_id, deletion_deadline
     ) VALUES (
       $1, $2, $3, $4, 'pending', $5,
       $6, $5, 'uploaded', 'queued', NULL, $7, $8
     )`,
    [
      attemptId,
      accountId,
      occurrenceId,
      attemptNumber,
      effectiveSubmittedAt,
      firstSubmittedAt,
      mediaAssetId,
      '2026-10-19T09:04:00.000Z',
    ],
  );

  return {
    attemptId,
    occurrenceId,
    mediaAssetId,
    firstSubmittedAt,
    effectiveSubmittedAt,
    event: {
      id: randomUUID(),
      accountId,
      eventType: 'evidence.verification.requested',
      aggregateType: 'evidence_attempt',
      aggregateId: attemptId,
      payload: { attemptId, occurrenceId, mediaAssetId },
      attemptCount: 1,
      claimToken: randomUUID(),
    },
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
    [accountId, `mts081-${accountId}`],
  );
});

afterAll(async () => {
  await pool.end();
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

describe('MTS-081 AI evidence verification', () => {
  it('sends only allowed mission context and the submitted image reference in one AI request', async () => {
    const seeded = await seedQueuedAttempt();
    const verifyEvidence = vi.fn((request: EvidenceVerificationGatewayRequest) => {
      expect(request).toEqual({
        missionContext: {
          missionTitle: 'Organizer meeting',
          providerTaskDetails: 'Organizer agenda',
          scheduleContext:
            '2026-09-19T09:00:00 → 2026-09-19T10:00:00 · Asia/Hong_Kong · fixed_instant',
        },
        submittedImage: {
          assetId: seeded.mediaAssetId,
          purpose: 'evidence-working',
          variant: 'original',
        },
      });
      expect(JSON.stringify(request)).not.toContain('Private note');
      return Promise.resolve({ verdict: 'accepted', reasonCode: 'verified' });
    });
    const service = createEvidenceVerificationService({ pool, gateway: { verifyEvidence } });

    await expect(service.processOutboxEvent(seeded.event)).resolves.toMatchObject({
      attemptId: seeded.attemptId,
      occurrenceId: seeded.occurrenceId,
      verdict: 'accepted',
      reasonCode: 'verified',
    });
    expect(verifyEvidence).toHaveBeenCalledTimes(1);

    const stored = await pool.query<{
      status: string;
      verificationStatus: string;
      reasonCode: string | null;
    }>(
      `SELECT status, verification_status AS "verificationStatus", reason_code AS "reasonCode"
         FROM evidence_attempts
        WHERE id = $1`,
      [seeded.attemptId],
    );
    expect(stored.rows[0]).toEqual({
      status: 'accepted',
      verificationStatus: 'accepted',
      reasonCode: 'verified',
    });
  });

  it('maps rejected output to a controlled reason code without a second explanation call', async () => {
    const seeded = await seedQueuedAttempt();
    const verifyEvidence = vi.fn(() =>
      Promise.resolve({ verdict: 'rejected', reasonCode: 'task_mismatch' }),
    );
    const service = createEvidenceVerificationService({ pool, gateway: { verifyEvidence } });

    await expect(service.processOutboxEvent(seeded.event)).resolves.toMatchObject({
      verdict: 'rejected',
      reasonCode: 'task_mismatch',
    });
    expect(verifyEvidence).toHaveBeenCalledTimes(1);

    const stored = await pool.query<{ reasonCode: string | null; verificationStatus: string }>(
      `SELECT reason_code AS "reasonCode", verification_status AS "verificationStatus"
         FROM evidence_attempts
        WHERE id = $1`,
      [seeded.attemptId],
    );
    expect(stored.rows[0]).toEqual({
      reasonCode: 'task_mismatch',
      verificationStatus: 'rejected',
    });
  });

  it('rejects malformed or raw provider output and leaves authoritative verification state queued', async () => {
    const seeded = await seedQueuedAttempt();
    const service = createEvidenceVerificationService({
      pool,
      gateway: {
        verifyEvidence() {
          return Promise.resolve({
            verdict: 'rejected',
            reasonCode: 'task_mismatch',
            rawModelText: 'The model generated an unrestricted explanation.',
          });
        },
      },
    });

    await expect(service.processOutboxEvent(seeded.event)).rejects.toMatchObject({
      name: 'EvidenceVerificationInvalidOutputError',
    });

    const stored = await pool.query<{
      status: string;
      verificationStatus: string;
      reasonCode: string | null;
    }>(
      `SELECT status, verification_status AS "verificationStatus", reason_code AS "reasonCode"
         FROM evidence_attempts
        WHERE id = $1`,
      [seeded.attemptId],
    );
    expect(stored.rows[0]).toEqual({
      status: 'pending',
      verificationStatus: 'queued',
      reasonCode: null,
    });
  });

  it('accepts a successful retry while preserving the first-submit timestamp needed for proof bonus timing', async () => {
    const seeded = await seedQueuedAttempt({ attemptNumber: 2 });
    const service = createEvidenceVerificationService({
      pool,
      gateway: {
        verifyEvidence() {
          return Promise.resolve({ verdict: 'accepted', reasonCode: 'verified' });
        },
      },
    });

    await expect(service.processOutboxEvent(seeded.event)).resolves.toMatchObject({
      attemptNumber: 2,
      firstSubmittedAt: seeded.firstSubmittedAt,
      effectiveSubmittedAt: seeded.effectiveSubmittedAt,
      verdict: 'accepted',
      reasonCode: 'verified',
    });
  });
});
