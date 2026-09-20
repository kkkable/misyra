import { randomUUID } from 'node:crypto';

import { evidenceVerificationReasonCodeSchema } from '@misyra/contracts';
import { calculateMediaDeletionDeadline, evaluateCompletionEligibility } from '@misyra/domain';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

import type { ProtectedMediaService, ProtectedMediaUploadCommitted } from './protected-media.js';

export type EvidenceAttemptErrorCode =
  | 'validation_failed'
  | 'not_found'
  | 'conflict'
  | 'already_completed'
  | 'completion_window_expired'
  | 'evidence_attempt_limit';

export class EvidenceAttemptError extends Error {
  constructor(readonly code: EvidenceAttemptErrorCode) {
    super(code);
    this.name = 'EvidenceAttemptError';
  }
}

type EvidenceAttemptServiceOptions = Readonly<{
  pool: Pool;
  protectedMediaService: Pick<
    ProtectedMediaService,
    'authorizeUpload' | 'readAssetOriginal' | 'deleteAsset'
  >;
  now?: () => Date;
}>;

type ReserveEvidenceAttemptInput = Readonly<{
  attemptId?: unknown;
  submittedAt?: unknown;
  contentType?: unknown;
}>;

interface LockedOccurrenceRow extends QueryResultRow {
  id: string;
  localStart: string;
  localFinish: string;
  startInstant: Date;
  finishInstant: Date;
  timeZone: string;
  timeBehavior: 'local_time' | 'fixed_instant';
  allDay: boolean;
  estimatedEffortMinutes: number | null;
  scheduleState: string;
  completionState: string;
  deletionState: string;
  tombstoned: boolean;
  hasCompletion: boolean;
}

interface ExistingAttemptRow extends QueryResultRow {
  id: string;
  accountId: string;
  occurrenceId: string;
  attemptNumber: number;
  firstSubmittedAt: Date;
  effectiveSubmittedAt: Date;
  mediaAssetId: string | null;
}

interface AttemptSequenceRow extends QueryResultRow {
  attemptNumber: number;
  firstSubmittedAt: Date;
}

interface UploadedAttemptRow extends QueryResultRow {
  id: string;
  occurrenceId: string;
  uploadStatus: string;
  verificationStatus: string;
}

interface LatestAttemptIdRow extends QueryResultRow {
  id: string;
}

interface AttemptResultRow extends QueryResultRow {
  id: string;
  status: string;
  occurrenceId: string;
  attemptNumber: number;
  firstSubmittedAt: Date;
  effectiveSubmittedAt: Date;
  verificationStatus: string;
  reasonCode: string | null;
  mediaDeletionState: string | null;
  hasCompletion: boolean;
  localStart: string;
  localFinish: string;
  startInstant: Date;
  finishInstant: Date;
  timeZone: string;
  timeBehavior: 'local_time' | 'fixed_instant';
  allDay: boolean;
  estimatedEffortMinutes: number | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new EvidenceAttemptError('validation_failed');
  }
  return value;
}

function parseSubmittedAt(value: unknown, serverReceiptTime: Date): string {
  if (typeof value !== 'string') return serverReceiptTime.toISOString();
  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return serverReceiptTime.toISOString();
}

function parseContentType(value: unknown): string {
  if (typeof value !== 'string' || !/^image\/[a-z0-9.+-]{1,64}$/i.test(value)) {
    throw new EvidenceAttemptError('validation_failed');
  }
  return value;
}

function fullSchedule(row: LockedOccurrenceRow) {
  return {
    localStart: row.localStart,
    localFinish: row.localFinish,
    startInstant: row.startInstant.toISOString(),
    finishInstant: row.finishInstant.toISOString(),
    timeZone: row.timeZone,
    timeBehavior: row.timeBehavior,
    allDay: row.allDay,
    estimatedEffortMinutes: row.estimatedEffortMinutes,
  } as const;
}

async function lockOccurrence(
  client: PoolClient,
  accountId: string,
  occurrenceId: string,
): Promise<LockedOccurrenceRow> {
  const result = await client.query<LockedOccurrenceRow>(
    `SELECT
       o.id,
       o.local_start AS "localStart",
       o.local_finish AS "localFinish",
       o.start_instant AS "startInstant",
       o.finish_instant AS "finishInstant",
       o.time_zone AS "timeZone",
       o.time_behavior AS "timeBehavior",
       o.all_day AS "allDay",
       o.estimated_effort_minutes AS "estimatedEffortMinutes",
       o.schedule_state AS "scheduleState",
       o.completion_state AS "completionState",
       o.deletion_state AS "deletionState",
       EXISTS (
         SELECT 1
           FROM mission_occurrence_tombstones t
          WHERE t.occurrence_id = o.id AND t.account_id = o.account_id
       ) AS tombstoned,
       EXISTS (
         SELECT 1
           FROM mission_completions c
          WHERE c.occurrence_id = o.id AND c.account_id = o.account_id
       ) AS "hasCompletion"
     FROM mission_occurrences o
     WHERE o.id = $1 AND o.account_id = $2
     FOR UPDATE OF o`,
    [occurrenceId, accountId],
  );
  const occurrence = result.rows[0];
  if (occurrence === undefined) throw new EvidenceAttemptError('not_found');
  if (occurrence.tombstoned || occurrence.deletionState === 'deleted') {
    throw new EvidenceAttemptError('not_found');
  }
  return occurrence;
}

function assertNewAttemptAllowed(
  occurrence: LockedOccurrenceRow,
  effectiveSubmittedAt: string,
): void {
  if (occurrence.completionState === 'completed' || occurrence.hasCompletion) {
    throw new EvidenceAttemptError('already_completed');
  }
  if (occurrence.scheduleState !== 'scheduled') {
    throw new EvidenceAttemptError('conflict');
  }

  const eligibility = evaluateCompletionEligibility({
    schedule: fullSchedule(occurrence),
    actionInstant: effectiveSubmittedAt,
  });
  if (eligibility.state === 'expired') {
    throw new EvidenceAttemptError('completion_window_expired');
  }
  if (eligibility.state === 'not_started') {
    throw new EvidenceAttemptError('conflict');
  }
}

async function existingAttempt(
  client: PoolClient,
  attemptId: string,
): Promise<ExistingAttemptRow | null> {
  const result = await client.query<ExistingAttemptRow>(
    `SELECT
       id,
       account_id AS "accountId",
       occurrence_id AS "occurrenceId",
       attempt_number AS "attemptNumber",
       first_submitted_at AS "firstSubmittedAt",
       effective_submitted_at AS "effectiveSubmittedAt",
       media_asset_id AS "mediaAssetId"
     FROM evidence_attempts
     WHERE id = $1
     FOR UPDATE`,
    [attemptId],
  );
  return result.rows[0] ?? null;
}

function mediaDeadline(now: Date): Date {
  const value = calculateMediaDeletionDeadline(now.toISOString(), 'evidence-working');
  if (value === null) throw new Error('Evidence media must have a deletion deadline');
  return new Date(value);
}

function mediaStorageKey(accountId: string, assetId: string) {
  return `${accountId}/${assetId}/original`;
}

export function createEvidenceAttemptService(options: EvidenceAttemptServiceOptions) {
  const now = options.now ?? (() => new Date());

  async function authorizeReservation(
    accountId: string,
    attempt: ExistingAttemptRow,
    contentType: string,
  ) {
    if (attempt.mediaAssetId === null) {
      throw new EvidenceAttemptError('conflict');
    }
    const authorization = await options.protectedMediaService.authorizeUpload(
      accountId,
      attempt.mediaAssetId,
      {
        purpose: 'evidence-working',
        variant: 'original',
        contentType,
      },
    );
    return {
      attemptId: attempt.id,
      occurrenceId: attempt.occurrenceId,
      attemptNumber: attempt.attemptNumber,
      firstSubmittedAt: attempt.firstSubmittedAt.toISOString(),
      effectiveSubmittedAt: attempt.effectiveSubmittedAt.toISOString(),
      mediaAssetId: attempt.mediaAssetId,
      uploadPath: authorization.uploadPath,
      expiresAt: authorization.expiresAt,
    } as const;
  }

  return {
    async getMediaOriginal(accountId: string, attemptIdSource: unknown) {
      const attemptId = parseUuid(attemptIdSource);
      const result = await options.pool.query<{
        mediaAssetId: string | null;
        uploadStatus: string;
      }>(
        `SELECT
           media_asset_id AS "mediaAssetId",
           upload_status AS "uploadStatus"
         FROM evidence_attempts
         WHERE id = $1 AND account_id = $2`,
        [attemptId, accountId],
      );
      const attempt = result.rows[0];
      if (attempt === undefined || attempt.mediaAssetId === null) {
        throw new EvidenceAttemptError('not_found');
      }
      if (attempt.uploadStatus !== 'uploaded') {
        throw new EvidenceAttemptError('conflict');
      }
      return options.protectedMediaService.readAssetOriginal(accountId, attempt.mediaAssetId);
    },

    async deleteMedia(accountId: string, attemptIdSource: unknown) {
      const attemptId = parseUuid(attemptIdSource);
      const result = await options.pool.query<{
        mediaAssetId: string | null;
        hasCompletion: boolean;
      }>(
        `SELECT
           a.media_asset_id AS "mediaAssetId",
           EXISTS (
             SELECT 1
               FROM mission_completions c
              WHERE c.account_id = a.account_id
                AND c.occurrence_id = a.occurrence_id
           ) AS "hasCompletion"
         FROM evidence_attempts a
         WHERE a.id = $1 AND a.account_id = $2`,
        [attemptId, accountId],
      );
      const attempt = result.rows[0];
      if (attempt === undefined || attempt.mediaAssetId === null) {
        throw new EvidenceAttemptError('not_found');
      }
      if (!attempt.hasCompletion) {
        throw new EvidenceAttemptError('conflict');
      }
      await options.protectedMediaService.deleteAsset(accountId, attempt.mediaAssetId);
      return { deleted: true as const };
    },

    async getLatestAttemptId(accountId: string, occurrenceIdSource: unknown) {
      const occurrenceId = parseUuid(occurrenceIdSource);
      const result = await options.pool.query<LatestAttemptIdRow>(
        `SELECT id
           FROM evidence_attempts
          WHERE account_id = $1 AND occurrence_id = $2
          ORDER BY attempt_number DESC
          LIMIT 1`,
        [accountId, occurrenceId],
      );
      return { attemptId: result.rows[0]?.id ?? null } as const;
    },

    async getResult(accountId: string, attemptIdSource: unknown) {
      const attemptId = parseUuid(attemptIdSource);
      const result = await options.pool.query<AttemptResultRow>(
        `SELECT
           a.id,
           a.status,
           a.occurrence_id AS "occurrenceId",
           a.attempt_number AS "attemptNumber",
           a.first_submitted_at AS "firstSubmittedAt",
           a.effective_submitted_at AS "effectiveSubmittedAt",
           a.verification_status AS "verificationStatus",
           a.reason_code AS "reasonCode",
           m.deletion_state AS "mediaDeletionState",
           EXISTS (
             SELECT 1
               FROM mission_completions c
              WHERE c.account_id = a.account_id
                AND c.occurrence_id = a.occurrence_id
           ) AS "hasCompletion",
           o.local_start AS "localStart",
           o.local_finish AS "localFinish",
           o.start_instant AS "startInstant",
           o.finish_instant AS "finishInstant",
           o.time_zone AS "timeZone",
           o.time_behavior AS "timeBehavior",
           o.all_day AS "allDay",
           o.estimated_effort_minutes AS "estimatedEffortMinutes"
         FROM evidence_attempts a
         JOIN mission_occurrences o
           ON o.id = a.occurrence_id AND o.account_id = a.account_id
         LEFT JOIN media_assets m
           ON m.id = a.media_asset_id AND m.account_id = a.account_id
         WHERE a.id = $1 AND a.account_id = $2`,
        [attemptId, accountId],
      );
      const attempt = result.rows[0];
      if (attempt === undefined) throw new EvidenceAttemptError('not_found');
      if (
        attempt.verificationStatus !== 'pending' &&
        attempt.verificationStatus !== 'queued' &&
        attempt.verificationStatus !== 'accepted' &&
        attempt.verificationStatus !== 'rejected'
      ) {
        throw new EvidenceAttemptError('conflict');
      }
      const reasonCode =
        attempt.reasonCode === null
          ? null
          : evidenceVerificationReasonCodeSchema.safeParse(attempt.reasonCode);
      if (reasonCode !== null && !reasonCode.success) {
        throw new EvidenceAttemptError('conflict');
      }
      const currentTime = now();
      const eligibility = evaluateCompletionEligibility({
        schedule: {
          localStart: attempt.localStart,
          localFinish: attempt.localFinish,
          startInstant: attempt.startInstant.toISOString(),
          finishInstant: attempt.finishInstant.toISOString(),
          timeZone: attempt.timeZone,
          timeBehavior: attempt.timeBehavior,
          allDay: attempt.allDay,
          estimatedEffortMinutes: attempt.estimatedEffortMinutes,
        },
        actionInstant: currentTime.toISOString(),
      });
      return {
        attemptId: attempt.id,
        occurrenceId: attempt.occurrenceId,
        attemptNumber: attempt.attemptNumber,
        firstSubmittedAt: attempt.firstSubmittedAt.toISOString(),
        effectiveSubmittedAt: attempt.effectiveSubmittedAt.toISOString(),
        verificationStatus: attempt.verificationStatus,
        reasonCode: reasonCode === null ? null : reasonCode.data,
        duplicateLoser: attempt.status === 'duplicate_loser',
        mediaAvailable: attempt.mediaDeletionState === 'active',
        mediaDeletable: attempt.mediaDeletionState === 'active' && attempt.hasCompletion,
        expired: eligibility.state === 'expired',
        serverNow: currentTime.toISOString(),
        expiresAt: eligibility.expiresAt,
      } as const;
    },

    async reserve(
      accountId: string,
      occurrenceIdSource: unknown,
      input: ReserveEvidenceAttemptInput,
    ) {
      const occurrenceId = parseUuid(occurrenceIdSource);
      const attemptId = parseUuid(input.attemptId);
      const contentType = parseContentType(input.contentType);
      const currentTime = now();
      const effectiveSubmittedAt = parseSubmittedAt(input.submittedAt, currentTime);
      const client = await options.pool.connect();
      let reserved: ExistingAttemptRow;

      try {
        await client.query('BEGIN');
        const occurrence = await lockOccurrence(client, accountId, occurrenceId);
        const replay = await existingAttempt(client, attemptId);
        if (replay !== null) {
          if (replay.accountId !== accountId) throw new EvidenceAttemptError('not_found');
          if (replay.occurrenceId !== occurrenceId) throw new EvidenceAttemptError('conflict');
          await client.query('COMMIT');
          reserved = replay;
        } else {
          assertNewAttemptAllowed(occurrence, effectiveSubmittedAt);

          const attempts = await client.query<AttemptSequenceRow>(
            `SELECT
               attempt_number AS "attemptNumber",
               first_submitted_at AS "firstSubmittedAt"
             FROM evidence_attempts
             WHERE account_id = $1 AND occurrence_id = $2
             ORDER BY attempt_number`,
            [accountId, occurrenceId],
          );
          const lastAttempt = attempts.rows.at(-1);
          if (attempts.rows.length >= 3 || (lastAttempt?.attemptNumber ?? 0) >= 3) {
            throw new EvidenceAttemptError('evidence_attempt_limit');
          }

          const attemptNumber = (lastAttempt?.attemptNumber ?? 0) + 1;
          const firstSubmittedAt =
            attempts.rows[0]?.firstSubmittedAt ?? new Date(effectiveSubmittedAt);
          const mediaAssetId = randomUUID();
          const deletionDeadline = mediaDeadline(currentTime);
          const storageKey = mediaStorageKey(accountId, mediaAssetId);

          await client.query(
            `INSERT INTO media_assets (
               id, account_id, purpose, storage_key, original_storage_key,
               deletion_due_at, deletion_state, retry_state, created_at
             ) VALUES (
               $1, $2, 'evidence-working', $3, $3,
               $4, 'active', 'ready', $5
             )`,
            [mediaAssetId, accountId, storageKey, deletionDeadline, currentTime],
          );
          await client.query(
            `INSERT INTO evidence_attempts (
               id, account_id, occurrence_id, attempt_number, status, submitted_at,
               first_submitted_at, effective_submitted_at, upload_status,
               verification_status, reason_code, media_asset_id, deletion_deadline, created_at
             ) VALUES (
               $1, $2, $3, $4, 'pending', $5,
               $6, $5, 'pending',
               'pending', NULL, $7, $8, $9
             )`,
            [
              attemptId,
              accountId,
              occurrenceId,
              attemptNumber,
              new Date(effectiveSubmittedAt),
              firstSubmittedAt,
              mediaAssetId,
              deletionDeadline,
              currentTime,
            ],
          );

          await client.query('COMMIT');
          reserved = {
            id: attemptId,
            accountId,
            occurrenceId,
            attemptNumber,
            firstSubmittedAt,
            effectiveSubmittedAt: new Date(effectiveSubmittedAt),
            mediaAssetId,
          };
        }
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      return authorizeReservation(accountId, reserved, contentType);
    },

    async handleMediaUploaded(input: ProtectedMediaUploadCommitted): Promise<void> {
      if (input.purpose !== 'evidence-working' || input.variant !== 'original') return;
      const client = await options.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query<UploadedAttemptRow>(
          `SELECT
             id,
             occurrence_id AS "occurrenceId",
             upload_status AS "uploadStatus",
             verification_status AS "verificationStatus"
           FROM evidence_attempts
           WHERE account_id = $1 AND media_asset_id = $2
           FOR UPDATE`,
          [input.accountId, input.assetId],
        );
        const attempt = result.rows[0];
        if (attempt === undefined) {
          await client.query('COMMIT');
          return;
        }
        if (attempt.uploadStatus === 'uploaded' && attempt.verificationStatus !== 'pending') {
          await client.query('COMMIT');
          return;
        }

        const shouldQueue = attempt.verificationStatus === 'pending';
        await client.query(
          `UPDATE evidence_attempts
              SET upload_status = 'uploaded',
                  verification_status = CASE
                    WHEN verification_status = 'pending' THEN 'queued'
                    ELSE verification_status
                  END
            WHERE id = $1 AND account_id = $2`,
          [attempt.id, input.accountId],
        );

        if (shouldQueue) {
          await client.query(
            `INSERT INTO outbox_events (
               account_id, event_type, aggregate_type, aggregate_id, payload, available_at
             ) VALUES (
               $1, 'evidence.verification.requested', 'evidence_attempt', $2, $3, $4
             )`,
            [
              input.accountId,
              attempt.id,
              {
                attemptId: attempt.id,
                occurrenceId: attempt.occurrenceId,
                mediaAssetId: input.assetId,
              },
              now(),
            ],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export type EvidenceAttemptService = ReturnType<typeof createEvidenceAttemptService>;
