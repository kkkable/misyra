import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', async () => {
  const { createElement: h } = await import('react');
  return {
    Pressable: ({ children, ...props }) => h('Pressable', props, children),
    StyleSheet: { create: (value) => value },
    Text: ({ children, ...props }) => h('Text', props, children),
    View: ({ children, ...props }) => h('View', props, children),
  };
});

import { StoryTextSuggestionsPanel } from './story-text-suggestions-panel.tsx';

function hostTextByTestId(renderer, testID) {
  return renderer.root.findAllByProps({ testID }).find((node) => node.type === 'Text');
}

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

describe('MTS-092 Story text suggestion panel', () => {
  it('shows suggestions before placement and waits for an explicit user choice', () => {
    const onChoose = vi.fn();
    let renderer;

    act(() => {
      renderer = create(
        createElement(StoryTextSuggestionsPanel, {
          suggestions,
          messages: {
            title: 'Suggestions',
            useHeadline: 'Use headline',
            useSupportingText: 'Use supporting text',
            useBoth: 'Use both',
            photoOnly: 'Photo only',
            sharingNotes: 'Sharing Notes',
            musicMood: 'Music / mood',
            mention: 'Mention',
            location: 'Location',
            poll: 'Poll',
          },
          onChoose,
        }),
      );
    });

    expect(hostTextByTestId(renderer, 'story-suggestion-headline')?.props.children).toBe(
      'Done before dinner',
    );
    expect(hostTextByTestId(renderer, 'story-suggestion-supporting')?.props.children).toBe(
      'A steady 5K after work.',
    );
    expect(hostTextByTestId(renderer, 'story-suggestion-music-mood')?.props.children).toContain(
      'upbeat running track',
    );
    expect(hostTextByTestId(renderer, 'story-suggestion-location')?.props.children).toContain(
      'Hong Kong',
    );
    expect(hostTextByTestId(renderer, 'story-suggestion-poll')?.props.children).toContain(
      'Run again tomorrow?',
    );
    expect(onChoose).not.toHaveBeenCalled();

    act(() => renderer.root.findByProps({ testID: 'story-suggestion-use-both' }).props.onPress());
    expect(onChoose).toHaveBeenLastCalledWith('both');

    act(() => renderer.root.findByProps({ testID: 'story-suggestion-photo-only' }).props.onPress());
    expect(onChoose).toHaveBeenLastCalledWith('photo_only');
  });
});
