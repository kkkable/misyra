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

const suggestions = {
  headline: 'Done before dinner',
  supportingText: 'A steady 5K after work.',
  sharingNotes: {
    musicMood: 'upbeat running track',
    mention: null,
    location: 'Hong Kong',
    poll: null,
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
          },
          onChoose,
        }),
      );
    });

    expect(renderer.root.findByProps({ testID: 'story-suggestion-headline' }).props.children).toBe(
      'Done before dinner',
    );
    expect(
      renderer.root.findByProps({ testID: 'story-suggestion-supporting' }).props.children,
    ).toBe('A steady 5K after work.');
    expect(onChoose).not.toHaveBeenCalled();

    act(() => renderer.root.findByProps({ testID: 'story-suggestion-use-both' }).props.onPress());
    expect(onChoose).toHaveBeenLastCalledWith('both');

    act(() => renderer.root.findByProps({ testID: 'story-suggestion-photo-only' }).props.onPress());
    expect(onChoose).toHaveBeenLastCalledWith('photo_only');
  });
});
