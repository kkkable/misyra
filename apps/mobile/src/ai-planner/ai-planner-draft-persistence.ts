import {
  publishLocalMutationApplied,
  type MutationQueueDatabase,
  type SyncMutation,
} from '../storage/mutation-queue.js';
import { createAiPlannerDraftInput, type AiPlannerDraftInput } from './ai-planner-input.js';

export type AiPlannerDraftPersistenceOptions = Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  generateMutationId: () => string;
  now: () => Date;
}>;

export type PersistedAiPlannerDraft = Readonly<{
  draftId: string;
  input: AiPlannerDraftInput;
  updatedAt: string;
}>;

type PlannerDraftRow = Readonly<{
  draft_id: string;
  content_json: string;
  updated_at: string;
}>;

export function createAiPlannerDraftPersistence(options: AiPlannerDraftPersistenceOptions) {
  const load = async (): Promise<PersistedAiPlannerDraft | null> => {
    const row = await options.database.getFirstAsync<PlannerDraftRow>(
      `SELECT draft_id, content_json, updated_at
         FROM planner_drafts
        WHERE account_id = ?`,
      options.accountId,
    );
    if (row === null) return null;
    const parsed = JSON.parse(row.content_json) as AiPlannerDraftInput;
    return {
      draftId: row.draft_id,
      input: createAiPlannerDraftInput(parsed),
      updatedAt: row.updated_at,
    };
  };

  const save = async (input: AiPlannerDraftInput): Promise<PersistedAiPlannerDraft> => {
    const validated = createAiPlannerDraftInput(input);
    const mutationId = options.generateMutationId();
    const updatedAt = options.now().toISOString();
    const mutation: SyncMutation<AiPlannerDraftInput> = {
      mutationId,
      accountId: options.accountId,
      deviceId: options.deviceId,
      entityType: 'planner',
      entityId: options.accountId,
      operation: 'update',
      baseVersion: null,
      clientOccurredAt: updatedAt,
      payload: validated,
    };
    const envelope = JSON.stringify({
      mutation,
      destination: { kind: 'server' as const },
    });
    let applied = false;

    await options.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `INSERT INTO planner_drafts (account_id, draft_id, content_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           draft_id = excluded.draft_id,
           content_json = excluded.content_json,
           updated_at = excluded.updated_at`,
        options.accountId,
        options.accountId,
        JSON.stringify(validated),
        updatedAt,
      );
      await transaction.runAsync(
        `DELETE FROM mutation_queue
          WHERE account_id = ?
            AND json_extract(command_json, '$.mutation.entityType') = 'planner'`,
        options.accountId,
      );
      const sequenceRow = await transaction.getFirstAsync<{ next_sequence: number }>(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
           FROM mutation_queue
          WHERE account_id = ?`,
        options.accountId,
      );
      const sequence = sequenceRow?.next_sequence ?? 1;
      if (!Number.isSafeInteger(sequence) || sequence <= 0) {
        throw new Error('Planner mutation queue sequence is invalid.');
      }
      await transaction.runAsync(
        `INSERT INTO mutation_queue
          (account_id, mutation_id, sequence, command_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        options.accountId,
        mutationId,
        sequence,
        envelope,
        updatedAt,
      );
      applied = true;
    });

    if (applied) publishLocalMutationApplied({ entityType: 'planner' });
    return { draftId: options.accountId, input: validated, updatedAt };
  };

  return Object.freeze({ load, save });
}
