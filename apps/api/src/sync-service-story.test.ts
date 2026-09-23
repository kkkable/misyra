import { describe, expect, it, vi } from 'vitest';

import type { PostgresSyncStore } from '@misyra/database';

import { createSyncService } from './sync-service.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const occurrenceId = '33333333-3333-4333-8333-333333333333';
const draftId = '44444444-4444-4444-8444-444444444444';

function mutation(mutationId: string, clientOccurredAt: string) {
  return {
    mutationId,
    accountId,
    deviceId,
    entityType: 'story' as const,
    entityId: occurrenceId,
    operation: 'update' as const,
    baseVersion: null,
    clientOccurredAt,
    payload: {
      draftId,
      notes: { musicMood: null, mention: null, location: null, poll: null },
      imageVersions: [],
    },
  };
}

describe('MTS-090 Story sync-service conflicts', () => {
  it(
    'returns a Story conflict as a settled contiguous prefix and stops before later mutations',
    async () => {
      const acceptedId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const conflictId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const trailingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      let call = 0;

      const storePush = vi.fn<PostgresSyncStore['push']>(async (_account, mutations) => {
        const current = mutations[0];
        if (current === undefined) {
          throw new Error('Expected one mutation per sync-service store call');
        }
        call += 1;
        if (call === 1) {
          return { acceptedMutationIds: [current.mutationId] };
        }
        return {
          acceptedMutationIds: [],
          conflicts: [
            {
              kind: 'story_updated',
              mutationId: current.mutationId,
              storyDraftId: draftId,
            },
          ],
        };
      });
      const store = {
        push: storePush,
        pull: async () => ({
          kind: 'incremental' as const,
          changes: [],
          nextCursor: 0,
          hasMore: false,
        }),
        snapshot: async () => ({ entries: [], nextCursor: 0 }),
      } satisfies PostgresSyncStore;
      const service = createSyncService(store);

      await expect(
        service.push(accountId, [
          mutation(acceptedId, '2026-09-23T09:31:00.000Z'),
          mutation(conflictId, '2026-09-23T09:32:00.000Z'),
          mutation(trailingId, '2026-09-23T09:33:00.000Z'),
        ]),
      ).resolves.toEqual({
        acceptedMutationIds: [acceptedId],
        conflicts: [
          {
            kind: 'story_updated',
            mutationId: conflictId,
            storyDraftId: draftId,
          },
        ],
      });
      expect(storePush).toHaveBeenCalledTimes(2);
    },
  );
});
