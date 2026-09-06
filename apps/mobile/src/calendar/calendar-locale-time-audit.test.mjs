import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  deepLinkDate: '2026-09-07',
  firstWeekday: 2,
  languageTag: 'en-HK',
  uses24hourClock: false,
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ date: mockState.deepLinkDate }),
}));

vi.mock('expo-localization', () => ({
  getCalendars: () => [
    {
      firstWeekday: mockState.firstWeekday,
      uses24hourClock: mockState.uses24hourClock,
    },
  ],
  getLocales: () => [
    {
      languageTag: mockState.languageTag,
      languageCode: 'en',
      languageScriptCode: null,
      regionCode: 'HK',
    },
  ],
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

function allDayMission(id, orderKey) {
  return { id, title: id, orderKey, completed: false };
}

function renderScreen(props = {}) {
  let renderer;
  act(() => {
    renderer = create(
      createElement(CalendarDayScreen, {
        language: 'en',
        now: new Date(2026, 8, 6, 8, 37),
        ...props,
      }),
    );
  });
  return renderer;
}

beforeEach(() => {
  mockState.deepLinkDate = '2026-09-07';
  mockState.firstWeekday = 2;
  mockState.languageTag = 'en-HK';
  mockState.uses24hourClock = false;
});

describe('MTS-040 Calendar app-language audit correction', () => {
  it('uses the authoritative app language for Calendar copy even when device language differs', () => {
    const renderer = renderScreen({ language: 'zh-HK' });
    const picker = renderer.root.findByProps({ testID: 'calendar-date-picker-trigger' });
    const week = renderer.root.findByProps({ testID: 'calendar-week-strip' });
    const today = renderer.root.findByProps({ testID: 'calendar-today-button' });

    expect(picker.props.accessibilityLabel).toBe('選擇日期');
    expect(week.props.accessibilityLabel).toBe('日曆');
    expect(today.props.accessibilityLabel).toBe('今天');
  });
});

describe('MTS-041 Calendar phone-time and accessibility audit correction', () => {
  it('honors the phone 12-hour setting instead of hardcoding 24-hour hour labels', () => {
    const renderer = renderScreen({ language: 'en' });
    const midnight = renderer.root.findByProps({ testID: 'calendar-hour-label-0' });

    expect(midnight.children.join('')).toMatch(/12.*AM/i);
  });

  it('exposes localized human-readable current-time semantics and no diagnostic day-body label', () => {
    mockState.deepLinkDate = '2026-09-06';
    const renderer = renderScreen({ language: 'en' });
    const ruler = renderer.root.findByProps({ testID: 'calendar-current-time-ruler' });
    const dayBody = renderer.root.findByProps({ testID: 'calendar-day-body' });

    expect(ruler.props.accessibilityLabel).toMatch(/^Current time,/);
    expect(ruler.props.accessibilityLabel).not.toContain('current-time:');
    expect(dayBody.props.accessibilityLabel).toBeUndefined();
  });
});

describe('MTS-042 all-day app-language audit correction', () => {
  it('uses the authoritative app language for +N-more copy instead of reading device locale', () => {
    const renderer = renderScreen({
      language: 'zh-HK',
      allDayMissionsByDate: {
        '2026-09-07': [
          allDayMission('all-day-1', '001'),
          allDayMission('all-day-2', '002'),
          allDayMission('all-day-3', '003'),
          allDayMission('all-day-4', '004'),
        ],
      },
    });
    const more = renderer.root.findByProps({ testID: 'calendar-all-day-more' });

    expect(more.props.accessibilityLabel).toBe('另外 1 項');
  });
});
