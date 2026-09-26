import { storyDraftSyncPayloadSchema } from '@misyra/contracts';

import {
  createMutationQueue,
  type MutationQueueDatabase,
  type SyncMutationOperation,
} from '../storage/mutation-queue.js';

type StoryOfflineDraftStoreOptions = Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  generateMutationId: () => string;
  now?: () => Date;
}>;

type StoryDraftRow = Readonly<{ draft_id: string; created_at: string | null }>;
type StoryDraftPayloadRow = Readonly<{ composition_json: string }>;
type StoryMissionRow = Readonly<{
  completion_state: string | null;
  deletion_state: string | null;
}>;

const STORY_RETENTION_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

export async function pruneExpiredStoryDrafts(
  input: Readonly<{
    database: MutationQueueDatabase;
    accountId: string;
    now?: () => Date;
  }>,
): Promise<number> {
  const now = input.now?.() ?? new Date();
  const cutoff = new Date(now.getTime() - STORY_RETENTION_MILLISECONDS).toISOString();
  const expired = await input.database.getAllAsync<{ occurrence_id: string }>(
    `SELECT occurrence_id
       FROM story_drafts
      WHERE account_id = ?
        AND created_at IS NOT NULL
        AND created_at <= ?
      ORDER BY occurrence_id`,
    input.accountId,
    cutoff,
  );
  if (expired.length === 0) return 0;

  await input.database.withExclusiveTransactionAsync(async (transaction) => {
    for (const row of expired) {
      await transaction.runAsync(
        `DELETE FROM mutation_queue
          WHERE account_id = ?
            AND json_extract(command_json, '$.mutation.entityType') = 'story'
            AND json_extract(command_json, '$.mutation.entityId') = ?`,
        input.accountId,
        row.occurrence_id,
      );
      await transaction.runAsync(
        'DELETE FROM story_drafts WHERE account_id = ? AND occurrence_id = ?',
        input.accountId,
        row.occurrence_id,
      );
      await transaction.runAsync(
        `UPDATE cached_mission_occurrences
            SET payload_json = json_set(payload_json, '$.storyState', 'ready'),
                updated_at = ?
          WHERE account_id = ?
            AND occurrence_id = ?`,
        now.toISOString(),
        input.accountId,
        row.occurrence_id,
      );
    }
  });

  return expired.length;
}

function newestCompositionSaveTime(
  imageVersions: ReturnType<typeof storyDraftSyncPayloadSchema.parse>['imageVersions'],
  fallback: Date,
): string {
  let newest = Number.NEGATIVE_INFINITY;
  let value = fallback.toISOString();
  for (const version of imageVersions) {
    const timestamp = Date.parse(version.composition.savedAt);
    if (timestamp > newest) {
      newest = timestamp;
      value = new Date(timestamp).toISOString();
    }
  }
  return value;
}

export function createStoryOfflineDraftStore({
  database,
  accountId,
  deviceId,
  generateMutationId,
  now = () => new Date(),
}: StoryOfflineDraftStoreOptions) {
  const queue = createMutationQueue(database, accountId);

  return Object.freeze({
    pruneExpired() {
      return pruneExpiredStoryDrafts({ database, accountId, now });
    },

    async load(occurrenceId: string) {
      const row = await database.getFirstAsync<StoryDraftPayloadRow>(
        `SELECT composition_json
           FROM story_drafts
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      );
      if (row === null) return null;
      return storyDraftSyncPayloadSchema.parse(JSON.parse(row.composition_json) as unknown);
    },

    async save(occurrenceId: string, value: unknown): Promise<void> {
      const payload = storyDraftSyncPayloadSchema.parse(value);
      if (payload.imageVersions.length === 0) {
        throw new TypeError('Story draft must contain at least one image version.');
      }

      const mission = await database.getFirstAsync<StoryMissionRow>(
        `SELECT json_extract(payload_json, '$.completionState') AS completion_state,
                json_extract(payload_json, '$.deletionState') AS deletion_state
           FROM cached_mission_occurrences
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      );
      if (
        mission === null ||
        mission.completion_state !== 'completed' ||
        mission.deletion_state === 'deleted'
      ) {
        throw new Error('Story drafts require an active completed mission.');
      }

      const existing = await database.getFirstAsync<StoryDraftRow>(
        `SELECT draft_id, created_at
           FROM story_drafts
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      );
      if (existing !== null && existing.draft_id !== payload.draftId) {
        throw new Error('A different unfinished Story draft already exists for this mission.');
      }

      const operation: SyncMutationOperation = existing === null ? 'create' : 'update';
      const localSavedAt = newestCompositionSaveTime(payload.imageVersions, now());
      const createdAt = existing?.created_at ?? localSavedAt;

      await queue.enqueue({
        mutation: {
          mutationId: generateMutationId(),
          accountId,
          deviceId,
          entityType: 'story',
          entityId: occurrenceId,
          operation,
          baseVersion: null,
          clientOccurredAt: localSavedAt,
          payload,
        },
        destination: { kind: 'server' },
        applyLocal: async (transaction) => {
          await transaction.runAsync(
            `INSERT INTO story_drafts
               (account_id, occurrence_id, draft_id, composition_json, updated_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(account_id, occurrence_id) DO UPDATE SET
               draft_id = excluded.draft_id,
               composition_json = excluded.composition_json,
               updated_at = excluded.updated_at,
               created_at = COALESCE(story_drafts.created_at, excluded.created_at)`,
            accountId,
            occurrenceId,
            payload.draftId,
            JSON.stringify(payload),
            localSavedAt,
            createdAt,
          );
          await transaction.runAsync(
            `UPDATE cached_mission_occurrences
                SET payload_json = json_set(payload_json, '$.storyState', 'draft'),
                    updated_at = ?
              WHERE account_id = ?
                AND occurrence_id = ?`,
            localSavedAt,
            accountId,
            occurrenceId,
          );
        },
      });
    },
  });
}
