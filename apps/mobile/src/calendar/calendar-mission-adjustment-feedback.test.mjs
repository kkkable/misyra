import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');
  const Pressable = ({ children, ...props }) =>
    createReactElement(
      'Pressable',
      props,
      typeof children === 'function' ? children({ pressed: false }) : children,
    );
  return {
    Pressable,
    StyleSheet: { create: (styles) => styles },
    Text: 'Text',
    View: 'View',
  };
});

import { MissionAdjustmentFeedback } from './calendar-mission-adjustment-feedback.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function adjustment(warning = null) {
  return {
    allowed: true,
    missionId: 'mission-1',
    kind: 'move',
    previousStartMinute: 540,
    previousEndMinute: 600,
    startMinute: 555,
    endMinute: 615,
    rewardEligibility: warning === null ? 'eligible' : 'ineligible',
    warning,
  };
}

function renderFeedback(props = {}) {
  let renderer;
  act(() => {
    renderer = create(
      createElement(MissionAdjustmentFeedback, {
        adjustment: adjustment(),
        colorScheme: 'light',
        language: 'en',
        onUndo: vi.fn(),
        ...props,
      }),
    );
  });
  return renderer;
}

describe('MTS-047 adjustment feedback', () => {
  it('shows a visible brief Undo affordance after a normal immediate save', () => {
    const renderer = renderFeedback();
    expect(renderer.root.findByProps({ testID: 'calendar-adjustment-feedback' })).toBeDefined();
    expect(
      renderer.root.findByProps({ testID: 'calendar-adjustment-feedback-message' }).children,
    ).toContain('Mission updated.');
    expect(
      renderer.root.findByProps({ testID: 'calendar-adjustment-undo' }).children,
    ).toBeDefined();
  });

  it('uses the approved after-start XP-loss warning and executes Undo', async () => {
    const onUndo = vi.fn(async () => true);
    const renderer = renderFeedback({
      adjustment: adjustment('after_start_zero_xp'),
      onUndo,
    });

    expect(
      renderer.root.findByProps({ testID: 'calendar-adjustment-feedback-message' }).children,
    ).toContain('Editing after the start time will remove XP for this mission.');

    await act(async () => {
      await renderer.root.findByProps({ testID: 'calendar-adjustment-undo' }).props.onPress();
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('states permanent XP loss when a mission is moved into the past', () => {
    const renderer = renderFeedback({ adjustment: adjustment('past_zero_xp') });
    expect(
      renderer.root.findByProps({ testID: 'calendar-adjustment-feedback-message' }).children,
    ).toContain('Saving this mission in the past will permanently remove XP eligibility.');
  });
});
