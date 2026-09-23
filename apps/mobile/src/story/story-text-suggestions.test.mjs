import { describe, expect, it } from 'vitest';

import { applyStoryTextSuggestionSelection } from './story-text-suggestions.ts';

const composition = {
  canvas: { width: 1080, height: 1920 },
  background: { scale: 1, translateX: 0, translateY: 0, rotation: 0 },
  headline: null,
  supportingText: null,
  effects: [],
  revision: 4,
  savedAt: '2026-09-23T09:40:00.000Z',
};

const suggestions = {
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
};

describe('MTS-092 Story suggestion placement', () => {
  it('places only the explicitly selected headline/supporting text', () => {
    expect(
      applyStoryTextSuggestionSelection({
        composition,
        suggestions,
        selection: 'headline',
        savedAt: '2026-09-23T09:45:00.000Z',
      }),
    ).toMatchObject({
      headline: {
        text: 'Done before dinner',
        x: 120,
        y: 260,
        width: 840,
        fontSize: 72,
        fontCategory: 'system-bold',
        color: '#FFFFFF',
      },
      supportingText: null,
      revision: 5,
      savedAt: '2026-09-23T09:45:00.000Z',
    });

    expect(
      applyStoryTextSuggestionSelection({
        composition,
        suggestions,
        selection: 'both',
        savedAt: '2026-09-23T09:46:00.000Z',
      }),
    ).toMatchObject({
      headline: { text: 'Done before dinner' },
      supportingText: {
        text: 'A steady 5K after work.',
        x: 120,
        y: 1500,
        width: 840,
        fontSize: 44,
        fontCategory: 'system',
        color: '#FFFFFF',
      },
      revision: 5,
    });
  });

  it('keeps the current composition untouched when the user chooses photo-only', () => {
    expect(
      applyStoryTextSuggestionSelection({
        composition,
        suggestions,
        selection: 'photo_only',
        savedAt: '2026-09-23T09:47:00.000Z',
      }),
    ).toEqual(composition);
  });
});
