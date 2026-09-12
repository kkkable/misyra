import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { MotionPreferenceProvider } from '../experience/reduce-motion.js';
import { CompletionConfirmation } from './completion-confirmation-view.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(element) {
  let renderer;
  act(() => {
    renderer = create(element);
  });
  return renderer;
}

const event = Object.freeze({
  occurrenceId: '11111111-1111-4111-8111-111111111111',
  awardedXp: 86,
  totalXp: 250,
});

describe('MTS-061 compact completion confirmation', () => {
  it('renders in place with Done and Create Story actions and one completion haptic', () => {
    const onDone = vi.fn();
    const onCreateStory = vi.fn();
    const onCompletionHaptic = vi.fn();
    const renderer = render(
      createElement(
        MotionPreferenceProvider,
        { reduceMotion: true },
        createElement(CompletionConfirmation, {
          colorScheme: 'light',
          language: 'en',
          event,
          onDone,
          onCreateStory,
          onCompletionHaptic,
        }),
      ),
    );

    expect(renderer.root.findByProps({ testID: 'completion-confirmation' })).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'completion-confirmation-message' }).props.children).toBe(
      'Mission complete · +86 XP · Level 3',
    );
    expect(onCompletionHaptic).toHaveBeenCalledTimes(1);

    act(() => renderer.root.findByProps({ testID: 'completion-confirmation-done' }).props.onPress());
    act(() =>
      renderer.root.findByProps({ testID: 'completion-confirmation-create-story' }).props.onPress(),
    );

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onCreateStory).toHaveBeenCalledTimes(1);
  });

  it('uses localized compact action labels and static Reduce Motion presentation', () => {
    const renderer = render(
      createElement(
        MotionPreferenceProvider,
        { reduceMotion: true },
        createElement(CompletionConfirmation, {
          colorScheme: 'dark',
          language: 'zh-HK',
          event: { ...event, awardedXp: 0, totalXp: 164 },
          onDone: vi.fn(),
          onCreateStory: vi.fn(),
          onCompletionHaptic: vi.fn(),
        }),
      ),
    );

    expect(renderer.root.findByProps({ testID: 'completion-confirmation-message' }).props.children).toBe(
      '任務完成 · 0 XP',
    );
    expect(renderer.root.findByProps({ testID: 'completion-confirmation-done' }).props.accessibilityLabel).toBe(
      '完成',
    );
    expect(
      renderer.root.findByProps({ testID: 'completion-confirmation-create-story' }).props.accessibilityLabel,
    ).toBe('建立 Story');
    expect(renderer.root.findAllByProps({ testID: 'completion-confirmation-confetti' })).toHaveLength(0);
  });
});
