import { describe, expect, it } from 'vitest';

import {
  storyStyleProfileAiOutputSchema,
  storyStyleProfileGatewayRequestSchema,
  storyStyleProfileRebuildRequestSchema,
} from './v1/story-style-profile.ts';

const referenceIds = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888',
] as const;

const abstractProfile = {
  palette: ['#1F2937', '#F9FAFB'],
  contrast: 'high',
  crop: 'balanced',
  textPosition: 'lower_middle',
  fontCategory: 'sans',
  textDensity: 'sparse',
  emoji: 'sparse',
  effects: ['grain'],
  tone: 'calm',
} as const;

describe('MTS-093 Story style-profile contracts', () => {
  it('requires 3-8 unique reference images', () => {
    expect(
      storyStyleProfileRebuildRequestSchema.safeParse({
        referenceAssetIds: referenceIds.slice(0, 3),
      }).success,
    ).toBe(true);
    expect(
      storyStyleProfileRebuildRequestSchema.safeParse({
        referenceAssetIds: referenceIds,
      }).success,
    ).toBe(true);
    expect(
      storyStyleProfileRebuildRequestSchema.safeParse({
        referenceAssetIds: referenceIds.slice(0, 2),
      }).success,
    ).toBe(false);
    expect(
      storyStyleProfileRebuildRequestSchema.safeParse({
        referenceAssetIds: [...referenceIds, '99999999-9999-4999-8999-999999999999'],
      }).success,
    ).toBe(false);
    expect(
      storyStyleProfileRebuildRequestSchema.safeParse({
        referenceAssetIds: [referenceIds[0], referenceIds[1], referenceIds[0]],
      }).success,
    ).toBe(false);
  });

  it('accepts only abstract style features and rejects copied identity/template fields', () => {
    expect(storyStyleProfileAiOutputSchema.safeParse(abstractProfile).success).toBe(true);

    for (const forbidden of [
      { username: '@creator' },
      { logo: 'brand mark' },
      { watermark: 'creator watermark' },
      { face: 'person identity' },
      { caption: 'exact caption' },
      { template: 'exact layout template' },
    ]) {
      expect(
        storyStyleProfileAiOutputSchema.safeParse({ ...abstractProfile, ...forbidden }).success,
      ).toBe(false);
    }
  });

  it(
    'builds a provider-neutral request that identifies protected references and forbids exact copying',
    () => {
      const request = storyStyleProfileGatewayRequestSchema.parse({
        referenceImages: referenceIds.slice(0, 3).map((assetId) => ({
          assetId,
          purpose: 'style-references',
          variant: 'original',
        })),
        policy: {
          abstractOnly: true,
          prohibitedExactContent: [
            'templates',
            'usernames',
            'logos',
            'watermarks',
            'faces',
            'captions',
          ],
        },
      });

      expect(request.referenceImages).toHaveLength(3);
      expect(request.policy.abstractOnly).toBe(true);
    },
  );
});
