import { createHash } from 'node:crypto';

import { appendAccountChange, executeIdempotentCommand } from '@misyra/database';
import { calculateAwardedXp, evaluateCompletionEligibility } from '@misyra/domain';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { buildAuthoritativeProgressProjection } from './progress-projection.js';

export type AuthoritativeCompletionType =
  'verified_on_time' | 'verified_late' | 'self_confirmed' | 'private' | 'trust_mode';

export type AuthoritativeCompletionInput = Readonly<{
  accountId: string;
  occurrenceId: string;
  completionType: AuthoritativeCompletionType;
  effectiveActionAt: string;
  deviceId: string;
  idempotencyKey: string;
  evidenceAttemptId?: string;
}>;

export type AuthoritativeCompletionResult = Readonly<{
  status: 'completed' | 'already_completed';
  occurrenceId: string;
  completionId: string;
  completionType: AuthoritativeCompletionType;
  actionTime: string;
  reward: Readonly<{
    baseXp: number;
    proofBonusXp: number;
    awardedXp: number;
  }>;
}>;

export type CompletionRejectionReason =
  'not_found' | 'deleted' | 'cancelled' | 'not_started' | 'expired' | 'completion_mode_not_allowed';

export class CompletionRejectedError extends Error {
  readonly reason: CompletionRejectionReason;

  constructor(reason: CompletionRejectionReason) {
    super(`Completion rejected: ${reason}`);
    this.name = 'CompletionRejectedError';
    this.reason = reason;
  }
}

export class CompletionInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompletionInvariantError';
  }
}

interface LockedOccurrenceRow extends QueryResultRow {
  id: string;
  seriesId: string;
  seriesTitle: string;
  recurrence: unknown;
  localDate: string;
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
  evidenceState: string;
  rewardEligibility: 'undetermined' | 'eligible' | 'ineligible';
  rewardIssuance: string;
  calendarSource: string;
  fieldOwnership: string;
  storyState: string;
  deletionState: string;
  location: string | null;
  notes: string | null;
  version: number;
  tombstoned: boolean;
}

interface StoredCompletionRow extends QueryResultRow {
  id: string;
  completionType: AuthoritativeCompletionType;
  actionTime: Date;
  baseXp: number | null;
  proofBonusXp: number | null;
  awardedXp: number | null;
}

interface RewardBasisRow extends QueryResultRow {
  baseXp: number;
  revokedAt: Date | null;
}

interface InsertedCompletionRow extends QueryResultRow {
  id: string;
  completionType: AuthoritativeCompletionType;
  actionTime: Date;
}

interface EvidenceAttemptStateRow extends QueryResultRow {
  hasEvidenceAttempt: boolean;
}

interface TrustModeRow extends QueryResultRow {
  trustMode: boolean;
}

function requestHash(input: AuthoritativeCompletionInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        occurrenceId: input.occurrenceId,
        completionType: input.completionType,
        effectiveActionAt: input.effectiveActionAt,
        deviceId: input.deviceId,
        evidenceAttemptId: input.evidenceAttemptId ?? null,
      }),
    )
    .digest('hex');
}

function fullLocalSchedule(row: LockedOccurrenceRow) {
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
       o.series_id AS "seriesId",
       s.title AS "seriesTitle",
       s.recurrence_rule AS recurrence,
       o.local_date::text AS "localDate",
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
       o.evidence_state AS "evidenceState",
       o.reward_eligibility AS "rewardEligibility",
       o.reward_issuance AS "rewardIssuance",
       o.calendar_source AS "calendarSource",
       o.field_ownership AS "fieldOwnership",
       o.story_state AS "storyState",
       o.deletion_state AS "deletionState",
       o.location,
       o.notes,
       o.version,
       EXISTS (
         SELECT 1
         FROM mission_occurrence_tombstones t
         WHERE t.occurrence_id = o.id AND t.account_id = o.account_id
       ) AS tombstoned
     FROM mission_occurrences o
     JOIN mission_series s ON s.id = o.series_id AND s.account_id = o.account_id
     WHERE o.id = $1 AND o.account_id = $2
     FOR UPDATE OF o`,
    [occurrenceId, accountId],
  );
  const occurrence = result.rows[0];
  if (occurrence === undefined) {
    throw new CompletionRejectedError('not_found');
  }
  if (occurrence.tombstoned || occurrence.deletionState === 'deleted') {
    throw new CompletionRejectedError('deleted');
  }
  if (occurrence.scheduleState !== 'scheduled') {
    throw new CompletionRejectedError('cancelled');
  }
  return occurrence;
}

function assertCompletionWindow(occurrence: LockedOccurrenceRow, effectiveActionAt: string): void {
  const eligibility = evaluateCompletionEligibility({
    schedule: fullLocalSchedule(occurrence),
    actionInstant: effectiveActionAt,
  });
  if (eligibility.state === 'not_started') {
    throw new CompletionRejectedError('not_started');
  }
  if (eligibility.state === 'expired') {
    throw new CompletionRejectedError('expired');
  }
}

async function findStoredCompletion(
  client: PoolClient,
  accountId: string,
  occurrenceId: string,
): Promise<StoredCompletionRow | null> {
  const result = await client.query<StoredCompletionRow>(
    `SELECT
       c.id,
       c.completion_type AS "completionType",
       c.action_time AS "actionTime",
       r.base_xp AS "baseXp",
       r.proof_bonus_xp AS "proofBonusXp",
       r.awarded_xp AS "awardedXp"
     FROM mission_completions c
     LEFT JOIN reward_ledger r
       ON r.occurrence_id = c.occurrence_id AND r.account_id = c.account_id
     WHERE c.occurrence_id = $1 AND c.account_id = $2`,
    [occurrenceId, accountId],
  );
  return result.rows[0] ?? null;
}

async function assertCompletionModeAllowed(
  client: PoolClient,
  input: AuthoritativeCompletionInput,
  occurrence: LockedOccurrenceRow,
): Promise<void> {
  if (input.completionType === 'private') {
    if (
      occurrence.evidenceState !== 'not_submitted' &&
      occurrence.evidenceState !== 'not_required'
    ) {
      throw new CompletionRejectedError('completion_mode_not_allowed');
    }
    const attempts = await client.query<EvidenceAttemptStateRow>(
      `SELECT EXISTS (
         SELECT 1
         FROM evidence_attempts
         WHERE account_id = $1 AND occurrence_id = $2
       ) AS "hasEvidenceAttempt"`,
      [input.accountId, input.occurrenceId],
    );
    if (attempts.rows[0]?.hasEvidenceAttempt === true) {
      throw new CompletionRejectedError('completion_mode_not_allowed');
    }
    return;
  }

  if (input.completionType === 'trust_mode') {
    const settings = await client.query<TrustModeRow>(
      `SELECT trust_mode AS "trustMode"
       FROM user_settings
       WHERE account_id = $1
       FOR SHARE`,
      [input.accountId],
    );
    if (settings.rows[0]?.trustMode !== true) {
      throw new CompletionRejectedError('completion_mode_not_allowed');
    }
    if (occurrence.evidenceState === 'pending' || occurrence.evidenceState === 'accepted') {
      throw new CompletionRejectedError('completion_mode_not_allowed');
    }
  }
}

function resultFromStored(
  occurrenceId: string,
  row: StoredCompletionRow,
  status: 'already_completed',
): AuthoritativeCompletionResult {
  if (row.baseXp === null || row.proofBonusXp === null || row.awardedXp === null) {
    throw new CompletionInvariantError('Committed completion is missing its reward ledger row');
  }
  return Object.freeze({
    status,
    occurrenceId,
    completionId: row.id,
    completionType: row.completionType,
    actionTime: row.actionTime.toISOString(),
    reward: Object.freeze({
      baseXp: row.baseXp,
      proofBonusXp: row.proofBonusXp,
      awardedXp: row.awardedXp,
    }),
  });
}

async function resolveBaseXp(
  client: PoolClient,
  accountId: string,
  occurrenceId: string,
  rewardEligibility: LockedOccurrenceRow['rewardEligibility'],
): Promise<number> {
  if (rewardEligibility !== 'eligible') {
    return 0;
  }
  const result = await client.query<RewardBasisRow>(
    `SELECT base_xp AS "baseXp", revoked_at AS "revokedAt"
     FROM mission_reward_basis
     WHERE occurrence_id = $1 AND account_id = $2
     FOR UPDATE`,
    [occurrenceId, accountId],
  );
  const basis = result.rows[0];
  if (basis === undefined) {
    throw new CompletionInvariantError('Eligible occurrence is missing its reward basis');
  }
  return basis.revokedAt === null ? basis.baseXp : 0;
}

function evidenceStateFor(
  completionType: AuthoritativeCompletionType,
): 'accepted' | 'not_required' {
  return completionType === 'private' || completionType === 'trust_mode'
    ? 'not_required'
    : 'accepted';
}

function authoritativeMissionPayload(
  occurrence: LockedOccurrenceRow,
  evidenceState: 'accepted' | 'not_required',
) {
  return {
    version: occurrence.version + 1,
    series: {
      id: occurrence.seriesId,
      title: occurrence.seriesTitle,
      recurrence: occurrence.recurrence,
    },
    occurrence: {
      id: occurrence.id,
      seriesId: occurrence.seriesId,
      schedule: fullLocalSchedule(occurrence),
      scheduleState: occurrence.scheduleState,
      completionState: 'completed',
      evidenceState,
      rewardEligibility: occurrence.rewardEligibility,
      rewardIssuance: 'issued',
      calendarSource: occurrence.calendarSource,
      fieldOwnership: occurrence.fieldOwnership,
      synchronizationState: 'synced',
      storyState: occurrence.storyState,
      deletionState: occurrence.deletionState,
    },
    location: occurrence.location,
    notes: occurrence.notes,
  } as const;
}

export async function completeMissionAuthoritatively(
  pool: Pool,
  input: AuthoritativeCompletionInput,
): Promise<AuthoritativeCompletionResult> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return executeIdempotentCommand(pool, {
    accountId: input.accountId,
    key: input.idempotencyKey,
    requestHash: requestHash(input),
    expiresAt,
    async work(context) {
      const occurrence = await lockOccurrence(context.client, input.accountId, input.occurrenceId);
      assertCompletionWindow(occurrence, input.effectiveActionAt);

      const existing = await findStoredCompletion(
        context.client,
        input.accountId,
        input.occurrenceId,
      );
      if (existing !== null) {
        return resultFromStored(input.occurrenceId, existing, 'already_completed');
      }

      await assertCompletionModeAllowed(context.client, input, occurrence);

      const baseXp = await resolveBaseXp(
        context.client,
        input.accountId,
        input.occurrenceId,
        occurrence.rewardEligibility,
      );
      const awardedXp = calculateAwardedXp(baseXp, input.completionType);
      const proofBonusXp = Math.max(0, awardedXp - baseXp);
      const evidenceState = evidenceStateFor(input.completionType);

      await context.client.query(
        `UPDATE mission_occurrences
         SET completion_state = 'completed',
             evidence_state = $3,
             reward_issuance = 'issued',
             synchronization_state = 'synced',
             version = version + 1,
             updated_at = now()
         WHERE id = $1 AND account_id = $2`,
        [input.occurrenceId, input.accountId, evidenceState],
      );

      const completionResult = await context.client.query<InsertedCompletionRow>(
        `INSERT INTO mission_completions (
           account_id, occurrence_id, completion_type, action_time
         ) VALUES ($1, $2, $3, $4)
         RETURNING
           id,
           completion_type AS "completionType",
           action_time AS "actionTime"`,
        [input.accountId, input.occurrenceId, input.completionType, input.effectiveActionAt],
      );
      const completion = completionResult.rows[0];
      if (completion === undefined) {
        throw new CompletionInvariantError('Completion insert returned no row');
      }

      await context.client.query(
        `INSERT INTO reward_ledger (
           account_id, occurrence_id, base_xp, proof_bonus_xp, awarded_xp
         ) VALUES ($1, $2, $3, $4, $5)`,
        [input.accountId, input.occurrenceId, baseXp, proofBonusXp, awardedXp],
      );

      await context.client.query(
        `INSERT INTO streak_days (account_id, local_date, state, finalized)
         VALUES ($1, $2::date, 'continued', false)
         ON CONFLICT (account_id, local_date) DO UPDATE
         SET state = 'continued', updated_at = now()
         WHERE streak_days.finalized = false`,
        [input.accountId, occurrence.localDate],
      );

      await appendAccountChange(context.client, {
        accountId: input.accountId,
        entityType: 'mission',
        entityId: input.occurrenceId,
        operation: 'upsert',
        payload: authoritativeMissionPayload(occurrence, evidenceState),
      });

      const progressProjection = await buildAuthoritativeProgressProjection(context.client, {
        accountId: input.accountId,
        occurrenceId: input.occurrenceId,
        title: occurrence.seriesTitle,
        completedAt: completion.actionTime.toISOString(),
        awardedXp,
      });
      await appendAccountChange(context.client, {
        accountId: input.accountId,
        entityType: 'progress',
        entityId: input.accountId,
        operation: 'upsert',
        payload: progressProjection,
      });

      await context.enqueueOutbox({
        eventType: 'mission.completed',
        aggregateType: 'mission_occurrence',
        aggregateId: input.occurrenceId,
        protectedReference: { kind: 'mission_completion', id: completion.id },
      });

      return Object.freeze({
        status: 'completed' as const,
        occurrenceId: input.occurrenceId,
        completionId: completion.id,
        completionType: completion.completionType,
        actionTime: completion.actionTime.toISOString(),
        reward: Object.freeze({ baseXp, proofBonusXp, awardedXp }),
      });
    },
  });
}
