import { describe, expect, it } from 'vitest';

import {
  storyTextSuggestionsAiOutputSchema,
  storyTextSuggestionsGatewayRequestSchema,
} from './story-text-suggestions.js';

describe('MTS-092 Story text suggestion contracts', () => {
  it('allows only the approved Story-text request context and abstract style profile', () => {
    expect(
      storyTextSuggestionsGatewayRequestSchema.parse({
        missionContext: {
          missionTitle: 'Evening run',
          providerTaskDetails: null,
          scheduleContext: '18:00 → 18:45 · Asia/Hong_Kong · local_time',
          personalNote: 'First 5K after work',
        },
        completionType: 'verified_on_time',
        appLanguage: 'zh-HK',
        styleProfile: {
          tone: 'concise',
          textDensity: 'low',
          emoji: 'minimal',
        },
        claimPolicy: { mayClaimVerification: true },
      }),
    ).toMatchObject({
      missionContext: { personalNote: 'First 5K after work' },
      completionType: 'verified_on_time',
      appLanguage: 'zh-HK',
      claimPolicy: { mayClaimVerification: true },
    });

    expect(() =>
      storyTextSuggestionsGatewayRequestSchema.parse({
        missionContext: {
          missionTitle: 'Evening run',
          providerTaskDetails: null,
          scheduleContext: '18:00 → 18:45 · Asia/Hong_Kong · local_time',
          personalNote: 'First 5K after work',
        },
        completionType: 'verified_on_time',
        appLanguage: 'zh-HK',
        styleProfile: null,
        claimPolicy: { mayClaimVerification: true },
        userHistory: ['previous captions'],
      }),
    ).toThrow();
  });

  it('validates structured optional text and Sharing Notes without a feed-caption field', () => {
    const parsed = storyTextSuggestionsAiOutputSchema.parse({
      headline: 'Done before dinner',
      supportingText: 'A steady 5K after work.',
      sharingNotes: {
        musicMood: 'upbeat running track',
        mention: null,
        location: 'Hong Kong',
        poll: {
          question: 'Run again tomorrow?',
          options: ['Yes', 'Rest day'],
        },
      },
    });

    expect(parsed.headline).toBe('Done before dinner');
    expect(parsed.sharingNotes.poll?.options).toEqual(['Yes', 'Rest day']);

    expect(() =>
      storyTextSuggestionsAiOutputSchema.parse({
        ...parsed,
        feedCaption: 'Not part of v1 Story text',
      }),
    ).toThrow();
  });
});
