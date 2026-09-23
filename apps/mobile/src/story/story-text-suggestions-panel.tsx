import type { StoryTextSuggestionsResult } from '@misyra/contracts';

import type { StoryTextSuggestionSelection } from './story-text-suggestions.js';

export type StoryTextSuggestionsPanelMessages = Readonly<{
  title: string;
  useHeadline: string;
  useSupportingText: string;
  useBoth: string;
  photoOnly: string;
}>;

export function StoryTextSuggestionsPanel(
  _props: Readonly<{
    suggestions: StoryTextSuggestionsResult;
    messages: StoryTextSuggestionsPanelMessages;
    onChoose: (selection: StoryTextSuggestionSelection) => void;
  }>,
) {
  return null;
}
