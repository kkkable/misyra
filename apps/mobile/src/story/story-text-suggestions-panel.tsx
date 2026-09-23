import type { StoryTextSuggestionsResult } from '@misyra/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { StoryTextSuggestionSelection } from './story-text-suggestions.js';

export type StoryTextSuggestionsPanelMessages = Readonly<{
  title: string;
  useHeadline: string;
  useSupportingText: string;
  useBoth: string;
  photoOnly: string;
}>;

export function StoryTextSuggestionsPanel(
  props: Readonly<{
    suggestions: StoryTextSuggestionsResult;
    messages: StoryTextSuggestionsPanelMessages;
    onChoose: (selection: StoryTextSuggestionSelection) => void;
  }>,
) {
  return (
    <View accessibilityRole="summary" style={styles.panel}>
      <Text style={styles.title}>{props.messages.title}</Text>
      {props.suggestions.headline === null ? null : (
        <Text testID="story-suggestion-headline">{props.suggestions.headline}</Text>
      )}
      {props.suggestions.supportingText === null ? null : (
        <Text testID="story-suggestion-supporting">{props.suggestions.supportingText}</Text>
      )}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={props.suggestions.headline === null}
          onPress={() => {
            props.onChoose('headline');
          }}
          testID="story-suggestion-use-headline"
        >
          <Text>{props.messages.useHeadline}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={props.suggestions.supportingText === null}
          onPress={() => {
            props.onChoose('supporting_text');
          }}
          testID="story-suggestion-use-supporting"
        >
          <Text>{props.messages.useSupportingText}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={
            props.suggestions.headline === null || props.suggestions.supportingText === null
          }
          onPress={() => {
            props.onChoose('both');
          }}
          testID="story-suggestion-use-both"
        >
          <Text>{props.messages.useBoth}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            props.onChoose('photo_only');
          }}
          testID="story-suggestion-photo-only"
        >
          <Text>{props.messages.photoOnly}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 8,
  },
  panel: {
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
});
