import { describe, expect, it } from 'vitest';

import { syncPushResponseSchema } from './sync.js';

const mutationId = '11111111-1111-4111-8111-111111111111';
const missionId = '22222222-2222-4222-8222-222222222222';
const storyDraftId = '33333333-3333-4333-8333-333333333333';

describe('MTS-032 sync conflict response contract', () => {
  it('accepts typed conflict outcomes returned by sync push', () => {
    expect(
      syncPushResponseSchema.parse({
        acceptedMutationIds: [],
        conflicts: [
          { kind: 'mission_updated', mutationId, missionId },
          { kind: 'mission_deleted', mutationId, missionId },
          { kind: 'mission_completed_elsewhere', mutationId, missionId },
          { kind: 'story_updated', mutationId, storyDraftId },
        ],
      }),
    ).toEqual({
      acceptedMutationIds: [],
      conflicts: [
        { kind: 'mission_updated', mutationId, missionId },
        { kind: 'mission_deleted', mutationId, missionId },
        { kind: 'mission_completed_elsewhere', mutationId, missionId },
        { kind: 'story_updated', mutationId, storyDraftId },
      ],
    });
  });

  it('defaults conflicts to an empty list for accepted-only responses', () => {
    expect(syncPushResponseSchema.parse({ acceptedMutationIds: [mutationId] })).toEqual({
      acceptedMutationIds: [mutationId],
      conflicts: [],
    });
  });
});
