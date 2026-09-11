import { describe, expect, it, vi } from 'vitest';

import { pushQueuedMutationsWithCompletions } from './authenticated-sync-runtime.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const occurrenceId = '33333333-3333-4333-8333-333333333333';
const mutationId = '44444444-4444-4444-8444-444444444444';
const actionAt = '2026-09-11T09:05:00.000Z';

function completionMutation(overrides = {}) {
  return {
    mutationId,
    accountId,
    deviceId,
    entityType: 'completion',
    entityId: occurrenceId,
    operation: 'complete',
    baseVersion: null,
    clientOccurredAt: actionAt,
    payload: {
      completionMode: 'private',
      effectiveActionAt: actionAt,
      deviceId,
      idempotencyKey: mutationId,
    },
    ...overrides,
  };
}

function apiWithCompletionResult(result) {
  return {
    completeMission: vi.fn(async () => result),
    push: vi.fn(async () => ({ acceptedMutationIds: [], conflicts: [] })),
  };
}

describe('MTS-059 authenticated sync completion replay', () => {
  it('replays a durable completion through the authoritative completion endpoint', async () => {
    const api = apiWithCompletionResult({
      status: 'completed',
      occurrenceId,
      completionId: '55555555-5555-4555-8555-555555555555',
      completionType: 'private',
      actionTime: actionAt,
      reward: { baseXp: 100, proofBonusXp: 0, awardedXp: 100 },
    });

    await expect(pushQueuedMutationsWithCompletions(api, [completionMutation()])).resolves.toEqual({
      acceptedMutationIds: [mutationId],
      conflicts: [],
    });
    expect(api.completeMission).toHaveBeenCalledWith(occurrenceId, {
      completionMode: 'private',
      effectiveActionAt: actionAt,
      deviceId,
      idempotencyKey: mutationId,
    });
    expect(api.push).not.toHaveBeenCalled();
  });

  it('maps a different already-completed command to the existing completion conflict', async () => {
    const api = apiWithCompletionResult({
      status: 'already_completed',
      occurrenceId,
      completionId: '55555555-5555-4555-8555-555555555555',
      completionType: 'trust_mode',
      actionTime: '2026-09-11T09:02:00.000Z',
      reward: { baseXp: 100, proofBonusXp: 0, awardedXp: 100 },
    });

    await expect(pushQueuedMutationsWithCompletions(api, [completionMutation()])).resolves.toEqual({
      acceptedMutationIds: [],
      conflicts: [
        {
          kind: 'mission_completed_elsewhere',
          mutationId,
          missionId: occurrenceId,
        },
      ],
    });
  });

  it('rejects mismatched replay identity instead of changing the original command', async () => {
    const api = apiWithCompletionResult({
      status: 'completed',
      occurrenceId,
      completionId: '55555555-5555-4555-8555-555555555555',
      completionType: 'private',
      actionTime: actionAt,
      reward: { baseXp: 100, proofBonusXp: 0, awardedXp: 100 },
    });

    await expect(
      pushQueuedMutationsWithCompletions(api, [
        completionMutation({ clientOccurredAt: '2026-09-11T09:06:00.000Z' }),
      ]),
    ).rejects.toThrow('completion_mutation_invalid');
    expect(api.completeMission).not.toHaveBeenCalled();
  });
});
