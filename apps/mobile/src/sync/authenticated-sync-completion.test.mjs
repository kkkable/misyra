import { describe, expect, it, vi } from 'vitest';

import {
  createAuthenticatedSyncApi,
  pushQueuedMutationsWithCompletions,
} from './authenticated-sync-api.js';

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

  it('turns a permanent authoritative completion rejection into a reconcilable mission conflict', async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        version: 1,
        requestId: '66666666-6666-4666-8666-666666666666',
        ok: false,
        error: {
          version: 1,
          code: 'conflict',
          retryable: false,
          messageKey: 'error.conflict',
        },
      }),
    }));
    const api = createAuthenticatedSyncApi({
      baseUrl: 'https://api.example.test',
      accessToken: 'fixture-access-token',
      fetcher,
    });

    await expect(api.push([completionMutation()])).resolves.toEqual({
      acceptedMutationIds: [],
      conflicts: [
        {
          kind: 'mission_updated',
          mutationId,
          missionId: occurrenceId,
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps retryable authoritative completion failures retryable instead of settling them', async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        version: 1,
        requestId: '77777777-7777-4777-8777-777777777777',
        ok: false,
        error: {
          version: 1,
          code: 'temporarily_unavailable',
          retryable: true,
          messageKey: 'error.temporarily_unavailable',
        },
      }),
    }));
    const api = createAuthenticatedSyncApi({
      baseUrl: 'https://api.example.test',
      accessToken: 'fixture-access-token',
      fetcher,
    });

    await expect(api.push([completionMutation()])).rejects.toThrow('temporarily_unavailable');
    expect(fetcher).toHaveBeenCalledTimes(1);
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
