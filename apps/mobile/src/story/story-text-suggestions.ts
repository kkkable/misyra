import type { StoryTextSuggestionsResult } from '@misyra/contracts';

import type { StoryComposition } from './story-composition.js';

export type StoryTextSuggestionSelection =
  | 'headline'
  | 'supporting_text'
  | 'both'
  | 'photo_only';

export function applyStoryTextSuggestionSelection(_input: Readonly<{
  composition: StoryComposition;
  suggestions: StoryTextSuggestionsResult;
  selection: StoryTextSuggestionSelection;
  savedAt: string;
}>): StoryComposition {
  throw new Error('story_text_suggestion_placement_not_implemented');
}
