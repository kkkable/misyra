import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  setAccessibilityFocus: vi.fn(),
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
}));

vi.mock('expo-localization', () => ({
  getCalendars: () => [{ firstWeekday: 2, uses24hourClock: true }],
}));

vi.mock('../experience/native-haptics.js', () => ({
  haptics: { triggerNonBlocking: vi.fn() },
}));

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');
  const Pressable = ({ children, ...props }) =>
    createReactElement(
      'Pressable',
      props,
      typeof children === 'function' ? children({ pressed: false }) : children,
    );
  return {
    AccessibilityInfo: { setAccessibilityFocus: state.setAccessibilityFocus },
    Modal: 'Modal',
    Pressable,
    ScrollView: 'ScrollView',
    StyleSheet: {
      absoluteFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
      create: (styles) => styles,
      hairlineWidth: 1,
    },
    Text: 'Text',
    View: 'View',
    findNodeHandle: () => 5050,
    useColorScheme: () => 'light',
    useWindowDimensions: () => ({ width: 393, height: 852, scale: 3, fontScale: 1 }),
  };
});

import { CalendarDayScreen } from './calendar-day-screen.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('MTS-050 Calendar help integration', () => {
  it('opens from the ? trigger, closes without persistence, and restores accessibility focus to the trigger', async () => {
    state.setAccessibilityFocus.mockReset();
    let renderer;
    act(() => {
      renderer = create(createElement(CalendarDayScreen, { now: new Date(2026, 8, 8, 8, 37) }));
    });

    const trigger = renderer.root.findByProps({ testID: 'calendar-help-trigger' });
    expect(trigger.props.accessibilityLabel).toBe('Calendar help');

    act(() => trigger.props.onPress());
    expect(renderer.root.findByProps({ testID: 'calendar-help-sheet' })).toBeDefined();

    await act(async () => {
      renderer.root.findByProps({ testID: 'calendar-help-close' }).props.onPress();
      await Promise.resolve();
    });

    expect(renderer.root.findAllByProps({ testID: 'calendar-help-sheet' })).toHaveLength(0);
    expect(state.setAccessibilityFocus).toHaveBeenCalledWith(5050);

    act(() => trigger.props.onPress());
    expect(renderer.root.findByProps({ testID: 'calendar-help-sheet' })).toBeDefined();
  });

  it('closes the contextual sheet and forwards the full FAQ action without recording opened state', () => {
    const onHelpFaqPress = vi.fn();
    let renderer;
    act(() => {
      renderer = create(
        createElement(CalendarDayScreen, {
          now: new Date(2026, 8, 8, 8, 37),
          onHelpFaqPress,
        }),
      );
    });

    act(() => renderer.root.findByProps({ testID: 'calendar-help-trigger' }).props.onPress());
    act(() => renderer.root.findByProps({ testID: 'calendar-help-faq' }).props.onPress());

    expect(onHelpFaqPress).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({ testID: 'calendar-help-sheet' })).toHaveLength(0);
  });
});
