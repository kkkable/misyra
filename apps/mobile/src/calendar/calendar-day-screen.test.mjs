import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let deepLinkDate;
let firstWeekday = 2;

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => (deepLinkDate === undefined ? {} : { date: deepLinkDate }),
}));

vi.mock('expo-localization', () => ({
  getCalendars: () => [{ firstWeekday }],
  getLocales: () => [{ languageTag: 'en-HK' }],
}));

vi.mock('react-native', async () => {
  const actual = await vi.importActual('react-native');
  return {
    ...actual,
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

beforeEach(() => {
  deepLinkDate = undefined;
  firstWeekday = 2;
});

describe('MTS-040 rendered Calendar shell', () => {
  it('renders exactly seven regional days, level/streak placeholders, and no Today button on today', () => {
    const renderer = renderScreen();
    const days = renderer.root.findAll(
      (node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('calendar-day-'),
    );

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
    expect(renderer.root.findByProps({ testID: 'calendar-day-body' }).props.accessibilityLabel).toBe(
      'current-time:517',
    );
  });

  it('honors a deep-link date, exposes Today off today, and positions an empty day at 08:00', () => {
    deepLinkDate = '2026-09-09';
    const renderer = renderScreen();

    expect(renderer.root.findByProps({ testID: 'calendar-today-button' })).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'calendar-day-body' }).props.accessibilityLabel).toBe(
      'default-0800:480',
    );
  });

  it('uses the system regional week start instead of an app-specific preference', () => {
    firstWeekday = 1;
    deepLinkDate = '2026-09-09';
    const renderer = renderScreen();
    const days = renderer.root.findAll(
      (node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('calendar-day-'),
    );

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
    expect(renderer.root.findByProps({ testID: 'calendar-day-2026-09-10' }).props.accessibilityState).toEqual({
      selected: true,
    });
  });
});
