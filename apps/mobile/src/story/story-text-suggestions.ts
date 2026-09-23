import type { StoryTextSuggestionsResult } from '@misyra/contracts';

import {
  validateStoryComposition,
  type StoryComposition,
  type StoryTextLayer,
} from './story-composition.js';

export type StoryTextSuggestionSelection = 'headline' | 'supporting_text' | 'both' | 'photo_only';

function suggestedLayer(
  role: 'headline' | 'supportingText',
  text: string,
): StoryTextLayer {
  return {
    text,
    x: 120,
    y: role === 'headline' ? 260 : 1500,
    width: 840,
    fontSize: role === 'headline' ? 72 : 44,
    fontCategory: role === 'headline' ? 'system-bold' : 'system',
    color: '#FFFFFF',
  };
}

export function applyStoryTextSuggestionSelection(
  input: Readonly<{
    composition: StoryComposition;
    suggestions: StoryTextSuggestionsResult;
    selection: StoryTextSuggestionSelection;
    savedAt: string;
  }>,
): StoryComposition {
  if (input.selection === 'photo_only') return input.composition;

  const useHeadline = input.selection === 'headline' || input.selection === 'both';
  const useSupporting =
    input.selection === 'supporting_text' || input.selection === 'both';

  return validateStoryComposition({
    ...input.composition,
    headline:
      useHeadline && input.suggestions.headline !== null
        ? suggestedLayer('headline', input.suggestions.headline)
        : input.composition.headline,
    supportingText:
      useSupporting && input.suggestions.supportingText !== null
        ? suggestedLayer('supportingText', input.suggestions.supportingText)
        : input.composition.supportingText,
    revision: input.composition.revision + 1,
    savedAt: input.savedAt,
  });
}
