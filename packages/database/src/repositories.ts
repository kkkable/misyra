import type { Pool, PoolClient, QueryResultRow } from 'pg';

type DatabaseClient = Pool | PoolClient;

type SchedulePatch = Readonly<{
  localStart: string;
  localFinish: string;
  startInstant: Date;
  finishInstant: Date;
}>;

interface AccountRow extends QueryResultRow {
  id: string;
  provider: string;
  providerSubject: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MissionOccurrenceRow extends QueryResultRow {
  id: string;
  accountId: string;
  seriesId: string;
  localDate: string;
  localStart: string;
  localFinish: string;
  startInstant: Date;
  finishInstant: Date;
  timeZone: string;
  timeBehavior: string;
  completionState: string;
  deletionState: string;
  version: number;
}

interface OccurrenceMutationStateRow extends QueryResultRow {
  id: string;
  completionState: string;
  deletionState: string;
  tombstoned: boolean;
}

interface PersonalNoteRow extends QueryResultRow {
  occurrenceId: string;
  accountId: string;
  note: string;
  updatedAt: Date;
}

interface CompletionRow extends QueryResultRow {
  id: string;
  accountId: string;
  occurrenceId: string;
  completionType: string;
  actionTime: Date;
  createdAt: Date;
}

interface RewardRow extends QueryResultRow {
  id: string;
  accountId: string;
  occurrenceId: string;
  baseXp: number;
  proofBonusXp: number;
  awardedXp: number;
  createdAt: Date;
}

interface StreakDayRow extends QueryResultRow {
  id: string;
  accountId: string;
  localDate: string;
  state: string;
  finalized: boolean;
  updatedAt: Date;
}

interface StoryDraftRow extends QueryResultRow {
  id: string;
  accountId: string;
  occurrenceId: string;
  state: string;
  aiGenerationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PlannerDraftRow extends QueryResultRow {
  id: string;
  accountId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MediaAssetRow extends QueryResultRow {
  id: string;
  accountId: string;
  purpose: string;
  storageKey: string;
  deletionDueAt: Date | null;
  createdAt: Date;
}

interface FeedbackReportRow extends QueryResultRow {
  id: string;
  accountId: string | null;
  email: string | null;
  description: string;
  technicalDetails: unknown;
  submittedAt: Date;
}

interface ExternalEventLinkRow extends QueryResultRow {
  id: string;
  connectionId: string;
  occurrenceId: string;
  providerEventId: string;
  recurrenceScope: string;
}

export class TransactionRequiredError extends Error {
  constructor() {
    super('This repository operation requires an explicit transaction');
    this.name = 'TransactionRequiredError';
  }
}

export class RepositoryNotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} was not found for the bound account`);
    this.name = 'RepositoryNotFoundError';
  }
}

export class CompletedOccurrenceMutationError extends Error {
  constructor() {
    super('Completed mission occurrences are immutable');
    this.name = 'CompletedOccurrenceMutationError';
  }
}

export class TombstonedOccurrenceError extends Error {
  constructor() {
    super('Tombstoned mission occurrences cannot be mutated');
    this.name = 'TombstonedOccurrenceError';
  }
}

export interface AccountRepositories {
  accounts: {
    getCurrent(): Promise<AccountRow | null>;
  };
  missions: {
    findOccurrenceById(occurrenceId: string): Promise<MissionOccurrenceRow | null>;
    updateOccurrenceSchedule(
      occurrenceId: string,
      patch: SchedulePatch,
    ): Promise<MissionOccurrenceRow>;
    tombstoneOccurrence(occurrenceId: string, reason?: string | null): Promise<void>;
  };
  notes: {
    get(occurrenceId: string): Promise<PersonalNoteRow | null>;
    upsert(occurrenceId: string, note: string): Promise<PersonalNoteRow>;
  };
  completions: {
    findByOccurrenceId(occurrenceId: string): Promise<CompletionRow | null>;
  };
  rewards: {
    findByOccurrenceId(occurrenceId: string): Promise<RewardRow | null>;
  };
  streaks: {
    findByLocalDate(localDate: string): Promise<StreakDayRow | null>;
  };
  stories: {
    findActiveByOccurrenceId(occurrenceId: string): Promise<StoryDraftRow | null>;
  };
  plannerDrafts: {
    getCurrent(): Promise<PlannerDraftRow | null>;
  };
  media: {
    findById(mediaId: string): Promise<MediaAssetRow | null>;
  };
  feedback: {
    findById(feedbackId: string): Promise<FeedbackReportRow | null>;
  };
  externalLinks: {
    findByOccurrenceId(occurrenceId: string): Promise<ExternalEventLinkRow[]>;
  };
}

function requireTransaction(inTransaction: boolean): void {
  if (!inTransaction) {
    throw new TransactionRequiredError();
  }
}

async function findOccurrenceMutationState(
  client: DatabaseClient,
  accountId: string,
  occurrenceId: string,
): Promise<OccurrenceMutationStateRow | null> {
  const result = await client.query<OccurrenceMutationStateRow>(
    `SELECT
       o.id,
       o.completion_state AS "completionState",
       o.deletion_state AS "deletionState",
       EXISTS (
         SELECT 1
         FROM mission_occurrence_tombstones t
         WHERE t.occurrence_id = o.id AND t.account_id = o.account_id
       ) AS tombstoned
     FROM mission_occurrences o
     WHERE o.id = $1 AND o.account_id = $2
     FOR UPDATE OF o`,
    [occurrenceId, accountId],
  );
  return result.rows[0] ?? null;
}

function assertNotTombstoned(state: OccurrenceMutationStateRow): void {
  if (state.tombstoned || state.deletionState === 'deleted') {
    throw new TombstonedOccurrenceError();
  }
}

async function requireEditableOccurrence(
  client: DatabaseClient,
  accountId: string,
  occurrenceId: string,
): Promise<OccurrenceMutationStateRow> {
  const state = await findOccurrenceMutationState(client, accountId, occurrenceId);
  if (state === null) {
    throw new RepositoryNotFoundError('Mission occurrence');
  }
  assertNotTombstoned(state);
  if (state.completionState === 'completed') {
    throw new CompletedOccurrenceMutationError();
  }
  return state;
}

async function requireExistingOccurrence(
  client: DatabaseClient,
  accountId: string,
  occurrenceId: string,
): Promise<OccurrenceMutationStateRow> {
  const state = await findOccurrenceMutationState(client, accountId, occurrenceId);
  if (state === null) {
    throw new RepositoryNotFoundError('Mission occurrence');
  }
  assertNotTombstoned(state);
  return state;
}

function createBoundRepositories(
  client: DatabaseClient,
  accountId: string,
  inTransaction: boolean,
): AccountRepositories {
  return {
    accounts: {
      async getCurrent() {
        const result = await client.query<AccountRow>(
          `SELECT
             id,
             provider,
             provider_subject AS "providerSubject",
             created_at AS "createdAt",
             updated_at AS "updatedAt"
           FROM accounts
           WHERE id = $1`,
          [accountId],
        );
        return result.rows[0] ?? null;
      },
    },
    missions: {
      async findOccurrenceById(occurrenceId) {
        const result = await client.query<MissionOccurrenceRow>(
          `SELECT
             o.id,
             o.account_id AS "accountId",
             o.series_id AS "seriesId",
             o.local_date AS "localDate",
             o.local_start AS "localStart",
             o.local_finish AS "localFinish",
             o.start_instant AS "startInstant",
             o.finish_instant AS "finishInstant",
             o.time_zone AS "timeZone",
             o.time_behavior AS "timeBehavior",
             o.completion_state AS "completionState",
             o.deletion_state AS "deletionState",
             o.version
           FROM mission_occurrences o
           WHERE o.id = $1
             AND o.account_id = $2
             AND o.deletion_state = 'active'
             AND NOT EXISTS (
               SELECT 1
               FROM mission_occurrence_tombstones t
               WHERE t.occurrence_id = o.id AND t.account_id = o.account_id
             )`,
          [occurrenceId, accountId],
        );
        return result.rows[0] ?? null;
      },
      async updateOccurrenceSchedule(occurrenceId, patch) {
        requireTransaction(inTransaction);
        await requireEditableOccurrence(client, accountId, occurrenceId);
        const result = await client.query<MissionOccurrenceRow>(
          `UPDATE mission_occurrences
           SET local_start = $3,
               local_finish = $4,
               start_instant = $5,
               finish_instant = $6,
               version = version + 1,
               updated_at = now()
           WHERE id = $1 AND account_id = $2
           RETURNING
             id,
             account_id AS "accountId",
             series_id AS "seriesId",
             local_date AS "localDate",
             local_start AS "localStart",
             local_finish AS "localFinish",
             start_instant AS "startInstant",
             finish_instant AS "finishInstant",
             time_zone AS "timeZone",
             time_behavior AS "timeBehavior",
             completion_state AS "completionState",
             deletion_state AS "deletionState",
             version`,
          [
            occurrenceId,
            accountId,
            patch.localStart,
            patch.localFinish,
            patch.startInstant,
            patch.finishInstant,
          ],
        );
        const updated = result.rows[0];
        if (updated === undefined) {
          throw new RepositoryNotFoundError('Mission occurrence');
        }
        return updated;
      },
      async tombstoneOccurrence(occurrenceId, reason = null) {
        requireTransaction(inTransaction);
        await requireExistingOccurrence(client, accountId, occurrenceId);
        await client.query(
          `INSERT INTO mission_occurrence_tombstones (occurrence_id, account_id, deleted_at, reason)
           VALUES ($1, $2, now(), $3)`,
          [occurrenceId, accountId, reason],
        );
        const result = await client.query(
          `UPDATE mission_occurrences
           SET deletion_state = 'deleted', version = version + 1, updated_at = now()
           WHERE id = $1 AND account_id = $2`,
          [occurrenceId, accountId],
        );
        if (result.rowCount !== 1) {
          throw new RepositoryNotFoundError('Mission occurrence');
        }
      },
    },
    notes: {
      async get(occurrenceId) {
        const result = await client.query<PersonalNoteRow>(
          `SELECT
             n.occurrence_id AS "occurrenceId",
             n.account_id AS "accountId",
             n.note,
             n.updated_at AS "updatedAt"
           FROM mission_personal_notes n
           WHERE n.occurrence_id = $1 AND n.account_id = $2`,
          [occurrenceId, accountId],
        );
        return result.rows[0] ?? null;
      },
      async upsert(occurrenceId, note) {
        requireTransaction(inTransaction);
        await requireEditableOccurrence(client, accountId, occurrenceId);
        const result = await client.query<PersonalNoteRow>(
          `INSERT INTO mission_personal_notes (occurrence_id, account_id, note)
           VALUES ($1, $2, $3)
           ON CONFLICT (occurrence_id) DO UPDATE
           SET note = EXCLUDED.note, updated_at = now()
           RETURNING
             occurrence_id AS "occurrenceId",
             account_id AS "accountId",
             note,
             updated_at AS "updatedAt"`,
          [occurrenceId, accountId, note],
        );
        const saved = result.rows[0];
        if (saved === undefined) {
          throw new RepositoryNotFoundError('Mission personal note');
        }
        return saved;
      },
    },
    completions: {
      async findByOccurrenceId(occurrenceId) {
        const result = await client.query<CompletionRow>(
          `SELECT
             id,
             account_id AS "accountId",
             occurrence_id AS "occurrenceId",
             completion_type AS "completionType",
             action_time AS "actionTime",
             created_at AS "createdAt"
           FROM mission_completions
           WHERE occurrence_id = $1 AND account_id = $2`,
          [occurrenceId, accountId],
        );
        return result.rows[0] ?? null;
      },
    },
    rewards: {
      async findByOccurrenceId(occurrenceId) {
        const result = await client.query<RewardRow>(
          `SELECT
             id,
             account_id AS "accountId",
             occurrence_id AS "occurrenceId",
             base_xp AS "baseXp",
             proof_bonus_xp AS "proofBonusXp",
             awarded_xp AS "awardedXp",
             created_at AS "createdAt"
           FROM reward_ledger
           WHERE occurrence_id = $1 AND account_id = $2`,
          [occurrenceId, accountId],
        );
        return result.rows[0] ?? null;
      },
    },
    streaks: {
      async findByLocalDate(localDate) {
        const result = await client.query<StreakDayRow>(
          `SELECT
             id,
             account_id AS "accountId",
             local_date AS "localDate",
             state,
             finalized,
             updated_at AS "updatedAt"
           FROM streak_days
           WHERE local_date = $1 AND account_id = $2`,
          [localDate, accountId],
        );
        return result.rows[0] ?? null;
      },
    },
    stories: {
      async findActiveByOccurrenceId(occurrenceId) {
        const result = await client.query<StoryDraftRow>(
          `SELECT
             id,
             account_id AS "accountId",
             occurrence_id AS "occurrenceId",
             state,
             ai_generation_count AS "aiGenerationCount",
             created_at AS "createdAt",
             updated_at AS "updatedAt"
           FROM story_drafts
           WHERE occurrence_id = $1 AND account_id = $2 AND state = 'active'`,
          [occurrenceId, accountId],
        );
        return result.rows[0] ?? null;
      },
    },
    plannerDrafts: {
      async getCurrent() {
        const result = await client.query<PlannerDraftRow>(
          `SELECT
             id,
             account_id AS "accountId",
             status,
             created_at AS "createdAt",
             updated_at AS "updatedAt"
           FROM ai_planner_drafts
           WHERE account_id = $1`,
          [accountId],
        );
        return result.rows[0] ?? null;
      },
    },
    media: {
      async findById(mediaId) {
        const result = await client.query<MediaAssetRow>(
          `SELECT
             id,
             account_id AS "accountId",
             purpose,
             storage_key AS "storageKey",
             deletion_due_at AS "deletionDueAt",
             created_at AS "createdAt"
           FROM media_assets
           WHERE id = $1 AND account_id = $2`,
          [mediaId, accountId],
        );
        return result.rows[0] ?? null;
      },
    },
    feedback: {
      async findById(feedbackId) {
        const result = await client.query<FeedbackReportRow>(
          `SELECT
             id,
             account_id AS "accountId",
             email,
             description,
             technical_details AS "technicalDetails",
             submitted_at AS "submittedAt"
           FROM feedback_reports
           WHERE id = $1 AND account_id = $2`,
          [feedbackId, accountId],
        );
        return result.rows[0] ?? null;
      },
    },
    externalLinks: {
      async findByOccurrenceId(occurrenceId) {
        const result = await client.query<ExternalEventLinkRow>(
          `SELECT
             l.id,
             l.connection_id AS "connectionId",
             l.occurrence_id AS "occurrenceId",
             l.provider_event_id AS "providerEventId",
             l.recurrence_scope AS "recurrenceScope"
           FROM external_event_links l
           INNER JOIN external_calendar_connections c ON c.id = l.connection_id
           INNER JOIN mission_occurrences o ON o.id = l.occurrence_id
           WHERE l.occurrence_id = $1
             AND c.account_id = $2
             AND o.account_id = $2`,
          [occurrenceId, accountId],
        );
        return result.rows;
      },
    },
  };
}

export function createAccountRepositories(pool: Pool, accountId: string): AccountRepositories {
  return createBoundRepositories(pool, accountId, false);
}

export async function runInTransaction<T>(
  pool: Pool,
  accountId: string,
  work: (repositories: AccountRepositories) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      const result = await work(createBoundRepositories(client, accountId, true));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
}
