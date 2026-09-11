import { completeMissionRequestSchema } from '@misyra/contracts';
import {
  createMissionOccurrence,
  type MissionOccurrence,
  type MissionOccurrenceInput,
} from '@misyra/domain';

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
  server_version: number | null;
}>;

type LocalBeforeCompletion = Readonly<{
  completionState: MissionOccurrence['completionState'];
  evidenceState: MissionOccurrence['evidenceState'];
  synchronizationState: MissionOccurrence['synchronizationState'];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function completionProjection(source: string) {
  const occurrence = createMissionOccurrence(JSON.parse(source) as MissionOccurrenceInput);
  if (occurrence.completionState !== 'incomplete') {
    throw new Error('completion_already_projected');
  }
  if (occurrence.deletionState !== 'active' || occurrence.scheduleState !== 'scheduled') {
    throw new Error('completion_not_available');
  }
  const localBefore: LocalBeforeCompletion = {
    completionState: occurrence.completionState,
    evidenceState: occurrence.evidenceState,
    synchronizationState: occurrence.synchronizationState,
  };
  return {
    localBefore,
    projected: createMissionOccurrence({
      ...occurrence,
      completionState: 'completed',
      evidenceState: 'not_required',
      synchronizationState: 'pending',
    }),
  } as const;
}

function assertServerVersion(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('completion_occurrence_server_version_invalid');
  }
  return value;
}

function matchesExistingCompletion(
  pending: Awaited<ReturnType<ReturnType<typeof createMutationQueue>['listPending']>>[number],
  input: QueueNoEvidenceCompletionInput,
): boolean {
  const mutation = pending.mutation;
  const payload = mutation.payload;
  if (!isRecord(payload)) return false;
  return (
    pending.destination.kind === 'server' &&
    mutation.accountId === input.accountId &&
    mutation.deviceId === input.deviceId &&
    mutation.entityType === 'completion' &&
    mutation.entityId === input.occurrenceId &&
    mutation.operation === 'complete' &&
    mutation.clientOccurredAt === input.effectiveActionAt &&
    payload.completionMode === input.mode &&
    payload.effectiveActionAt === input.effectiveActionAt &&
    payload.deviceId === input.deviceId &&
    payload.idempotencyKey === input.idempotencyKey
  );
}

export async function queueNoEvidenceCompletion(
  input: QueueNoEvidenceCompletionInput,
): Promise<void> {
  const {
    database,
    accountId,
    deviceId,
    occurrenceId,
    mode,
    effectiveActionAt,
    idempotencyKey,
  } = input;
  const request = completeMissionRequestSchema.parse({
    completionMode: mode,
    effectiveActionAt,
    deviceId,
    idempotencyKey,
  });
  const queue = createMutationQueue(database, accountId);
  const existing = (await queue.listPending()).find(
    (pending) => pending.mutation.mutationId === idempotencyKey,
  );
  if (existing !== undefined) {
    if (matchesExistingCompletion(existing, input)) return;
    throw new Error('Mutation ID is already queued with a different envelope.');
  }

  const cached = await database.getFirstAsync<CachedOccurrenceRow>(
    `SELECT payload_json, server_version
       FROM cached_mission_occurrences
      WHERE account_id = ? AND occurrence_id = ?`,
    accountId,
    occurrenceId,
  );
  if (cached === null) throw new Error('completion_occurrence_not_found');
  const baseVersion = assertServerVersion(cached.server_version);
  const { localBefore, projected } = completionProjection(cached.payload_json);

  await queue.enqueue({
    mutation: {
      mutationId: idempotencyKey,
      accountId,
      deviceId,
      entityType: 'completion',
      entityId: occurrenceId,
      operation: 'complete',
      baseVersion,
      clientOccurredAt: effectiveActionAt,
      payload: { ...request, localBefore },
    },
    destination: { kind: 'server' },
    applyLocal: async (transaction) => {
      const row = await transaction.getFirstAsync<CachedOccurrenceRow>(
        `SELECT payload_json, server_version
           FROM cached_mission_occurrences
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      );
      if (row === null) throw new Error('completion_occurrence_not_found');
      if (row.payload_json !== cached.payload_json || row.server_version !== cached.server_version) {
        throw new Error('completion_occurrence_changed');
      }
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
