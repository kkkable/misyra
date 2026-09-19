import {
  evidenceVerificationAiOutputSchema,
  evidenceVerificationGatewayRequestSchema,
  evidenceVerificationReasonCodeSchema,
  type EvidenceVerificationAiOutput,
  type EvidenceVerificationReasonCode,
} from '@misyra/contracts';
import type { ClaimedOutboxEvent } from '@misyra/database';
import type { Pool, QueryResultRow } from 'pg';

import type { AiGateway } from './ai-gateway.js';
import { completeMissionAuthoritatively } from './authoritative-completion.js';

export type EvidenceVerificationResult = Readonly<{
  attemptId: string;
  occurrenceId: string;
  attemptNumber: number;
  firstSubmittedAt: string;
  effectiveSubmittedAt: string;
  verdict: EvidenceVerificationAiOutput['verdict'];
  reasonCode: EvidenceVerificationReasonCode;
}>;

export class EvidenceVerificationInvalidOutputError extends Error {
  constructor() {
    super('Evidence verification provider returned invalid structured output');
    this.name = 'EvidenceVerificationInvalidOutputError';
  }
}

export class EvidenceVerificationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceVerificationStateError';
  }
}

interface VerificationAttemptRow extends QueryResultRow {
  id: string;
  occurrenceId: string;
  attemptNumber: number;
  firstSubmittedAt: Date;
  effectiveSubmittedAt: Date;
  finishInstant: Date;
  uploadStatus: string;
  verificationStatus: string;
  reasonCode: string | null;
  mediaAssetId: string | null;
  missionTitle: string;
  providerTaskDetails: string | null;
  localStart: string;
  localFinish: string;
  timeZone: string;
  timeBehavior: string;
  mediaPurpose: string | null;
  originalStorageKey: string | null;
}

function resultFromTerminalAttempt(row: VerificationAttemptRow): EvidenceVerificationResult {
  if (row.verificationStatus !== 'accepted' && row.verificationStatus !== 'rejected') {
    throw new EvidenceVerificationStateError(
      'Evidence attempt is not in a terminal verification state',
    );
  }
  const parsedReason = evidenceVerificationReasonCodeSchema.safeParse(row.reasonCode);
  if (!parsedReason.success) {
    throw new EvidenceVerificationStateError('Evidence attempt has an invalid stored reason code');
  }
  if (
    (row.verificationStatus === 'accepted' && parsedReason.data !== 'verified') ||
    (row.verificationStatus === 'rejected' && parsedReason.data === 'verified')
  ) {
    throw new EvidenceVerificationStateError('Evidence attempt verdict and reason code disagree');
  }
  return Object.freeze({
    attemptId: row.id,
    occurrenceId: row.occurrenceId,
    attemptNumber: row.attemptNumber,
    firstSubmittedAt: row.firstSubmittedAt.toISOString(),
    effectiveSubmittedAt: row.effectiveSubmittedAt.toISOString(),
    verdict: row.verificationStatus,
    reasonCode: parsedReason.data,
  });
}

function scheduleContext(row: VerificationAttemptRow): string {
  return `${row.localStart} → ${row.localFinish} · ${row.timeZone} · ${row.timeBehavior}`;
}

function completionTypeFor(
  attempt: Pick<VerificationAttemptRow, 'firstSubmittedAt' | 'finishInstant'>,
): 'verified_on_time' | 'verified_late' {
  const lateThreshold = attempt.finishInstant.getTime() + 10 * 60_000;
  return attempt.firstSubmittedAt.getTime() >= lateThreshold ? 'verified_late' : 'verified_on_time';
}

async function ensureAcceptedCompletion(
  pool: Pool,
  accountId: string,
  attempt: VerificationAttemptRow,
): Promise<void> {
  await completeMissionAuthoritatively(pool, {
    accountId,
    occurrenceId: attempt.occurrenceId,
    completionType: completionTypeFor(attempt),
    effectiveActionAt: attempt.effectiveSubmittedAt.toISOString(),
    deviceId: attempt.id,
    idempotencyKey: `evidence-verification:${attempt.id}`,
    evidenceAttemptId: attempt.id,
  });
}

async function loadAttempt(
  pool: Pool,
  accountId: string,
  attemptId: string,
): Promise<VerificationAttemptRow> {
  const result = await pool.query<VerificationAttemptRow>(
    `SELECT
       a.id,
       a.occurrence_id AS "occurrenceId",
       a.attempt_number AS "attemptNumber",
       a.first_submitted_at AS "firstSubmittedAt",
       a.effective_submitted_at AS "effectiveSubmittedAt",
       o.finish_instant AS "finishInstant",
       a.upload_status AS "uploadStatus",
       a.verification_status AS "verificationStatus",
       a.reason_code AS "reasonCode",
       a.media_asset_id AS "mediaAssetId",
       s.title AS "missionTitle",
       o.notes AS "providerTaskDetails",
       o.local_start::text AS "localStart",
       o.local_finish::text AS "localFinish",
       o.time_zone AS "timeZone",
       o.time_behavior AS "timeBehavior",
       m.purpose AS "mediaPurpose",
       m.original_storage_key AS "originalStorageKey"
     FROM evidence_attempts a
     JOIN mission_occurrences o
       ON o.id = a.occurrence_id AND o.account_id = a.account_id
     JOIN mission_series s
       ON s.id = o.series_id AND s.account_id = o.account_id
     LEFT JOIN media_assets m
       ON m.id = a.media_asset_id AND m.account_id = a.account_id
     WHERE a.id = $1 AND a.account_id = $2`,
    [attemptId, accountId],
  );
  const attempt = result.rows[0];
  if (attempt === undefined) {
    throw new EvidenceVerificationStateError('Evidence verification attempt was not found');
  }
  return attempt;
}

function assertVerificationEvent(event: ClaimedOutboxEvent): string {
  if (
    event.accountId === null ||
    event.eventType !== 'evidence.verification.requested' ||
    event.aggregateType !== 'evidence_attempt'
  ) {
    throw new EvidenceVerificationStateError('Unsupported evidence verification outbox event');
  }
  return event.accountId;
}

export function createEvidenceVerificationService(input: {
  readonly pool: Pool;
  readonly gateway: Pick<AiGateway, 'verifyEvidence'>;
}) {
  return Object.freeze({
    async processOutboxEvent(event: ClaimedOutboxEvent): Promise<EvidenceVerificationResult> {
      const accountId = assertVerificationEvent(event);
      const attempt = await loadAttempt(input.pool, accountId, event.aggregateId);

      if (attempt.verificationStatus === 'accepted' || attempt.verificationStatus === 'rejected') {
        if (attempt.verificationStatus === 'accepted') {
          await ensureAcceptedCompletion(input.pool, accountId, attempt);
        }
        return resultFromTerminalAttempt(attempt);
      }
      if (
        attempt.uploadStatus !== 'uploaded' ||
        attempt.verificationStatus !== 'queued' ||
        attempt.mediaAssetId === null ||
        attempt.mediaPurpose !== 'evidence-working' ||
        attempt.originalStorageKey === null
      ) {
        throw new EvidenceVerificationStateError('Evidence attempt is not ready for verification');
      }

      const request = evidenceVerificationGatewayRequestSchema.parse({
        missionContext: {
          missionTitle: attempt.missionTitle,
          providerTaskDetails: attempt.providerTaskDetails,
          scheduleContext: scheduleContext(attempt),
        },
        submittedImage: {
          assetId: attempt.mediaAssetId,
          purpose: 'evidence-working',
          variant: 'original',
        },
      });
      const rawOutput = await input.gateway.verifyEvidence(request);
      const parsedOutput = evidenceVerificationAiOutputSchema.safeParse(rawOutput);
      if (!parsedOutput.success) {
        throw new EvidenceVerificationInvalidOutputError();
      }

      let updateApplied = false;
      const client = await input.pool.connect();
      try {
        await client.query('BEGIN');
        const updated = await client.query<VerificationAttemptRow>(
          `UPDATE evidence_attempts
              SET status = $3,
                  verification_status = $3,
                  reason_code = $4
            WHERE id = $1
              AND account_id = $2
              AND verification_status = 'queued'
          RETURNING
            id,
            occurrence_id AS "occurrenceId",
            attempt_number AS "attemptNumber",
            first_submitted_at AS "firstSubmittedAt",
            effective_submitted_at AS "effectiveSubmittedAt",
            upload_status AS "uploadStatus",
            verification_status AS "verificationStatus",
            reason_code AS "reasonCode",
            media_asset_id AS "mediaAssetId"`,
          [attempt.id, accountId, parsedOutput.data.verdict, parsedOutput.data.reasonCode],
        );

        if (updated.rows[0] === undefined) {
          await client.query('ROLLBACK');
        } else {
          await client.query(
            `UPDATE mission_occurrences o
                SET evidence_state = CASE
                  WHEN EXISTS (
                    SELECT 1
                      FROM evidence_attempts a
                     WHERE a.account_id = o.account_id
                       AND a.occurrence_id = o.id
                       AND a.verification_status = 'accepted'
                  ) THEN 'accepted'
                  WHEN EXISTS (
                    SELECT 1
                      FROM evidence_attempts a
                     WHERE a.account_id = o.account_id
                       AND a.occurrence_id = o.id
                       AND a.verification_status IN ('pending', 'queued')
                  ) THEN 'pending'
                  ELSE 'rejected'
                END
              WHERE o.id = $1 AND o.account_id = $2`,
            [attempt.occurrenceId, accountId],
          );
          await client.query('COMMIT');
          updateApplied = true;
        }
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      if (!updateApplied) {
        const terminal = await loadAttempt(input.pool, accountId, attempt.id);
        if (terminal.verificationStatus === 'accepted') {
          await ensureAcceptedCompletion(input.pool, accountId, terminal);
        }
        return resultFromTerminalAttempt(terminal);
      }

      if (parsedOutput.data.verdict === 'accepted') {
        await ensureAcceptedCompletion(input.pool, accountId, attempt);
      }

      return Object.freeze({
        attemptId: attempt.id,
        occurrenceId: attempt.occurrenceId,
        attemptNumber: attempt.attemptNumber,
        firstSubmittedAt: attempt.firstSubmittedAt.toISOString(),
        effectiveSubmittedAt: attempt.effectiveSubmittedAt.toISOString(),
        verdict: parsedOutput.data.verdict,
        reasonCode: parsedOutput.data.reasonCode,
      });
    },
  });
}

export type EvidenceVerificationService = ReturnType<typeof createEvidenceVerificationService>;
