import { completeMissionRequestSchema } from '@misyra/contracts';
import { createMissionOccurrence, type MissionOccurrenceInput } from '@misyra/domain';

import { createMutationQueue, type MutationQueueDatabase } from '../storage/mutation-queue.js';
import type { NoEvidenceCompletionMode } from './private-trust-completion.js';

type QueueNoEvidenceCompletionInput = Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  occurrenceId: string;
  mode: NoEvidenceCompletionMode;
  effectiveActionAt: string;
  idempotencyKey: string;
}>;

type CachedOccurrenceRow = Readonly<{
  payload_json: string;
}>;

function optimisticOccurrence(source: string) {
  const occurrence = createMissionOccurrence(JSON.parse(source) as MissionOccurrenceInput);
  if (occurrence.completionState !== 'incomplete') {
    throw new Error('completion_already_projected');
  }
  if (occurrence.deletionState !== 'active' || occurrence.scheduleState !== 'scheduled') {
    throw new Error('completion_not_available');
  }
  return createMissionOccurrence({
    ...occurrence,
    completionState: 'completed',
    evidenceState: 'not_required',
    synchronizationState: 'pending',
  });
}

export async function queueNoEvidenceCompletion({
  database,
  accountId,
  deviceId,
  occurrenceId,
  mode,
  effectiveActionAt,
  idempotencyKey,
}: QueueNoEvidenceCompletionInput): Promise<void> {
  const request = completeMissionRequestSchema.parse({
    completionMode: mode,
    effectiveActionAt,
    deviceId,
    idempotencyKey,
  });
  const queue = createMutationQueue(database, accountId);

  await queue.enqueue({
    mutation: {
      mutationId: idempotencyKey,
      accountId,
      deviceId,
      entityType: 'completion',
      entityId: occurrenceId,
      operation: 'complete',
      baseVersion: null,
      clientOccurredAt: effectiveActionAt,
      payload: request,
    },
    destination: { kind: 'server' },
    applyLocal: async (transaction) => {
      const row = await transaction.getFirstAsync<CachedOccurrenceRow>(
        `SELECT payload_json
           FROM cached_mission_occurrences
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      );
      if (row === null) throw new Error('completion_occurrence_not_found');
      const projected = optimisticOccurrence(row.payload_json);
      const result = (await transaction.runAsync(
        `UPDATE cached_mission_occurrences
            SET payload_json = ?, updated_at = ?
          WHERE account_id = ? AND occurrence_id = ?`,
        JSON.stringify(projected),
        effectiveActionAt,
        accountId,
        occurrenceId,
      )) as { changes?: number };
      if (result.changes !== 1) throw new Error('completion_occurrence_not_found');
    },
  });
}
