import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  deepLinkDate: undefined,
  firstWeekday: 2,
  timelineMounts: 0,
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () =>
    mockState.deepLinkDate === undefined ? {} : { date: mockState.deepLinkDate },
}));

vi.mock('expo-localization', () => ({
  getCalendars: () => [{ firstWeekday: mockState.firstWeekday }],
  getLocales: () => [{ languageTag: 'en-HK' }],
}));

vi.mock('react-native', async () => {
  const { createElement: createReactElement, useEffect } = await import('react');

  const Pressable = ({ children, ...props }) =>
    createReactElement(
      'Pressable',
      props,
      typeof children === 'function' ? children({ pressed: false }) : children,
    );
  const ScrollView = ({ children, ...props }) => {
    useEffect(() => {
      mockState.timelineMounts += 1;
    }, []);
    return createReactElement('ScrollView', props, children);
  };

  return {
    Modal: 'Modal',
    Pressable,
    ScrollView,
    StyleSheet: {
      create: (styles) => styles,
    },
    Text: 'Text',
    View: 'View',
    useColorScheme: () => 'light',
    useWindowDimensions: () => ({ width: 393, height: 852, scale: 3, fontScale: 1 }),
  };
});

import { CalendarDayScreen } from './calendar-day-screen.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderScreen(props = {}) {
  let renderer;
  act(() => {
    renderer = create(
      createElement(CalendarDayScreen, {
        now: new Date(2026, 8, 6, 8, 37),
        ...props,
      }),
    );
  });
  return renderer;
}

function renderedDayButtons(renderer) {
  return renderer.root.findAll(
    (node) =>
      node.type === 'Pressable' &&
      typeof node.props.testID === 'string' &&
      /^calendar-day-\d{4}-\d{2}-\d{2}$/.test(node.props.testID),
  );
}

function allDayMission(id, orderKey) {
  return { id, title: id, orderKey, completed: false };
}

function timedMission(id, orderKey, startMinute = 540, endMinute = 600, status = 'unfinished') {
  return { id, title: id, orderKey, startMinute, endMinute, status };
}

beforeEach(() => {
  mockState.deepLinkDate = undefined;
  mockState.firstWeekday = 2;
  mockState.timelineMounts = 0;
});

describe('MTS-040 rendered Calendar shell', () => {
  it('renders exactly seven regional days, level/streak placeholders, and no Today button on today', () => {
    const renderer = renderScreen();
    const days = renderedDayButtons(renderer);

    expect(days.map((day) => day.props.testID)).toEqual([
      'calendar-day-2026-08-31',
      'calendar-day-2026-09-01',
      'calendar-day-2026-09-02',
      'calendar-day-2026-09-03',
      'calendar-day-2026-09-04',
      'calendar-day-2026-09-05',
      'calendar-day-2026-09-06',
    ]);
    expect(renderer.root.findAllByProps({ testID: 'calendar-today-button' })).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'calendar-timeline-scroll' }).props.contentOffset).toEqual(
      { x: 0, y: 487 },
    );
  });

  it('honors a deep-link date, exposes Today off today, and positions an empty day at 08:00', () => {
    mockState.deepLinkDate = '2026-09-09';
    const renderer = renderScreen();

    expect(renderer.root.findByProps({ testID: 'calendar-today-button' })).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'calendar-timeline-scroll' }).props.contentOffset).toEqual(
      { x: 0, y: 450 },
    );
  });

  it('uses the system regional week start instead of an app-specific preference', () => {
    mockState.firstWeekday = 1;
    mockState.deepLinkDate = '2026-09-09';
    const renderer = renderScreen();
    const days = renderedDayButtons(renderer);

    expect(days[0].props.testID).toBe('calendar-day-2026-09-06');
    expect(days[6].props.testID).toBe('calendar-day-2026-09-12');
  });

  it('opens the date picker and can select a date without adding a persistent control', () => {
    const renderer = renderScreen();
    const trigger = renderer.root.findByProps({ testID: 'calendar-date-picker-trigger' });

    act(() => trigger.props.onPress());
    expect(renderer.root.findByProps({ testID: 'calendar-date-picker' })).toBeDefined();

    const target = renderer.root.findByProps({ testID: 'calendar-picker-day-2026-09-10' });
    act(() => target.props.onPress());

    expect(renderer.root.findByProps({ testID: 'calendar-today-button' })).toBeDefined();
    expect(
      renderer.root.findByProps({ testID: 'calendar-day-2026-09-10' }).props.accessibilityState,
    ).toEqual({
      selected: true,
    });
  });
});

describe('MTS-041 Calendar timeline composition', () => {
  it('remounts the timeline when the selected date changes so its starting scroll offset reapplies', () => {
    const renderer = renderScreen();
    expect(mockState.timelineMounts).toBe(1);

    const nextDay = renderer.root.findByProps({ testID: 'calendar-day-2026-09-01' });
    act(() => nextDay.props.onPress());

    expect(mockState.timelineMounts).toBe(2);
  });
});

describe('MTS-042 Calendar all-day composition', () => {
  it('swaps the selected date all-day cards inside the Calendar scroll surface', () => {
    const onAllDayMissionPress = vi.fn();
    const renderer = renderScreen({
      allDayMissionsByDate: {
        '2026-09-06': [
          allDayMission('today-4', '004'),
          allDayMission('today-1', '001'),
          allDayMission('today-2', '002'),
          allDayMission('today-3', '003'),
        ],
        '2026-09-01': [allDayMission('other-1', '001')],
      },
      onAllDayMissionPress,
    });

    const header = renderer.root.findByProps({ testID: 'calendar-scroll-header' });
    const todayMission = renderer.root.findByProps({
      testID: 'calendar-all-day-mission-today-1',
    });
    const more = renderer.root.findByProps({ testID: 'calendar-all-day-more' });
    expect(header).toBeDefined();
    expect(todayMission).toBeDefined();
    expect(more.props.accessibilityLabel).toBe('+1 more');

    act(() => todayMission.props.onPress());
    expect(onAllDayMissionPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'today-1' }));

    const otherDay = renderer.root.findByProps({ testID: 'calendar-day-2026-09-01' });
    act(() => otherDay.props.onPress());
    const oldMission = renderer.root.findAllByProps({
      testID: 'calendar-all-day-mission-today-1',
    });
    const otherMission = renderer.root.findByProps({
      testID: 'calendar-all-day-mission-other-1',
    });
    expect(oldMission).toHaveLength(0);
    expect(otherMission).toBeDefined();
  });
});

describe('MTS-043 Calendar timed-mission composition', () => {
  it('renders and swaps the selected date overlap group inside the existing timeline', () => {
    const onTimedMissionPress = vi.fn();
    const renderer = renderScreen({
      timedMissionsByDate: {
        '2026-09-06': [
          timedMission('today-a', '001'),
          timedMission('today-b', '002'),
          timedMission('today-c', '003'),
          timedMission('today-d', '004'),
        ],
        '2026-09-01': [timedMission('other-a', '001', 600, 660, 'verified')],
      },
      onTimedMissionPress,
    });

    expect(renderer.root.findByProps({ testID: 'calendar-timed-mission-layer' })).toBeDefined();
    const todayMission = renderer.root.find(
      (node) => node.type === 'Pressable' && node.props.testID === 'calendar-mission-card-today-a',
    );
    expect(
      renderer.root.findAll(
        (node) =>
          node.type === 'Pressable' && node.props.testID === 'calendar-mission-card-today-c',
      ),
    ).toHaveLength(0);
    expect(
      renderer.root.find(
        (node) =>
          node.type === 'Pressable' && node.props.testID === 'calendar-overlap-more-overlap-0',
      ),
    ).toBeDefined();

    act(() => todayMission.props.onPress());
    expect(onTimedMissionPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'today-a' }));

    const otherDay = renderer.root.findByProps({ testID: 'calendar-day-2026-09-01' });
    act(() => otherDay.props.onPress());

    expect(
      renderer.root.findAll(
        (node) =>
          node.type === 'Pressable' && node.props.testID === 'calendar-mission-card-today-a',
      ),
    ).toHaveLength(0);
    expect(
      renderer.root.find(
        (node) =>
          node.type === 'Pressable' && node.props.testID === 'calendar-mission-card-other-a',
      ),
    ).toBeDefined();
  });
});
