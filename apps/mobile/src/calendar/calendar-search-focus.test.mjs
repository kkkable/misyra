import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

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
  const ScrollView = ({ children, ...props }) => createReactElement('ScrollView', props, children);
  return {
    Modal: 'Modal',
    Pressable,
    ScrollView,
    StyleSheet: { create: (styles) => styles },
    Text: 'Text',
    View: 'View',
    useColorScheme: () => 'light',
    useWindowDimensions: () => ({ width: 393, height: 852, scale: 3, fontScale: 1 }),
  };
});

import { CalendarDayScreen } from './calendar-day-screen.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function timedMission(id, startMinute = 630, endMinute = 660) {
  return {
    id,
    title: 'Search target',
    orderKey: '001',
    startMinute,
    endMinute,
    status: 'unfinished',
    rewardEligibility: 'eligible',
    timeZone: 'Asia/Hong_Kong',
  };
}

function flattenStyle(style) {
  if (!Array.isArray(style)) return style ?? {};
  return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
}

describe('MTS-049 Calendar search focus', () => {
  it('exposes a Calendar search trigger and forwards the action without storing a query', () => {
    const onSearchPress = vi.fn();
    let renderer;
    act(() => {
      renderer = create(
        createElement(CalendarDayScreen, {
          now: new Date(2026, 8, 6, 8, 37),
          onSearchPress,
        }),
      );
    });

    const trigger = renderer.root.findByProps({ testID: 'calendar-search-trigger' });
    act(() => trigger.props.onPress());
    expect(onSearchPress).toHaveBeenCalledTimes(1);
  });

  it('moves to the result date, scrolls to the mission, and highlights it before Mission Details opens', () => {
    const missionId = '11111111-1111-4111-8111-111111111111';
    let renderer;
    act(() => {
      renderer = create(
        createElement(CalendarDayScreen, {
          now: new Date(2026, 8, 6, 8, 37),
          searchFocusTarget: {
            requestId: 1,
            date: '2026-09-10',
            minute: 630,
            missionId,
          },
          timedMissionsByDate: {
            '2026-09-10': [timedMission(missionId)],
          },
        }),
      );
    });

    expect(
      renderer.root.findByProps({ testID: 'calendar-day-2026-09-10' }).props.accessibilityState,
    ).toEqual({ selected: true });
    expect(
      renderer.root.findByProps({ testID: 'calendar-timeline-scroll' }).props.contentOffset,
    ).toEqual({ x: 0, y: 600 });
    const card = renderer.root.find(
      (node) =>
        node.type === 'Pressable' && node.props.testID === `calendar-mission-card-${missionId}`,
    );
    expect(flattenStyle(card.props.style).borderWidth).toBe(2);
  });
});
