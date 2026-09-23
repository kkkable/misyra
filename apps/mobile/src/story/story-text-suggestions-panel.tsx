import type { StoryTextSuggestionsResult } from '@misyra/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { StoryTextSuggestionSelection } from './story-text-suggestions.js';

export type StoryTextSuggestionsPanelMessages = Readonly<{
  title: string;
  useHeadline: string;
  useSupportingText: string;
  useBoth: string;
  photoOnly: string;
  sharingNotes: string;
  musicMood: string;
  mention: string;
  location: string;
  poll: string;
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
      <Text style={styles.notesTitle}>{props.messages.sharingNotes}</Text>
      {props.suggestions.sharingNotes.musicMood === null ? null : (
        <Text testID="story-suggestion-music-mood">
          {`${props.messages.musicMood}: ${props.suggestions.sharingNotes.musicMood}`}
        </Text>
      )}
      {props.suggestions.sharingNotes.mention === null ? null : (
        <Text testID="story-suggestion-mention">
          {`${props.messages.mention}: ${props.suggestions.sharingNotes.mention}`}
        </Text>
      )}
      {props.suggestions.sharingNotes.location === null ? null : (
        <Text testID="story-suggestion-location">
          {`${props.messages.location}: ${props.suggestions.sharingNotes.location}`}
        </Text>
      )}
      {props.suggestions.sharingNotes.poll === null ? null : (
        <Text testID="story-suggestion-poll">
          {`${props.messages.poll}: ${props.suggestions.sharingNotes.poll.question} — ${props.suggestions.sharingNotes.poll.options.join(' / ')}`}
        </Text>
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
  notesTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  panel: {
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
});
