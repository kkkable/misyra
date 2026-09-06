import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  deepLinkDate: '2026-09-06',
  firstWeekday: 2,
  timeZone: 'UTC',
  uses24hourClock: true,
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ date: mockState.deepLinkDate }),
}));

vi.mock('expo-localization', () => ({
  getCalendars: () => [
    {
      firstWeekday: mockState.firstWeekday,
      timeZone: mockState.timeZone,
      uses24hourClock: mockState.uses24hourClock,
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
  const TextInput = (props) => createReactElement('TextInput', props);

  return {
    Modal: 'Modal',
    Pressable,
    ScrollView,
    StyleSheet: { create: (styles) => styles },
    Text: 'Text',
    TextInput,
    View: 'View',
    useColorScheme: () => 'light',
    useWindowDimensions: () => ({
      width: 393,
      height: 852,
      scale: 3,
      fontScale: 1,
    }),
  };
});

import { CalendarDayScreen } from './calendar-day-screen.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderScreen(props = {}) {
  let renderer;
  act(() => {
    renderer = create(
      createElement(CalendarDayScreen, {
        language: 'en',
        now: new Date(2026, 8, 6, 10, 0),
        ...props,
      }),
    );
  });
  return renderer;
}

beforeEach(() => {
  mockState.deepLinkDate = '2026-09-06';
  mockState.firstWeekday = 2;
  mockState.timeZone = 'UTC';
  mockState.uses24hourClock = true;
});

describe('MTS-044 two-tap slot selection', () => {
  it('selects on first tap without creating and opens the same slot on the second tap', () => {
    const renderer = renderScreen();
    const slot = renderer.root.findByProps({ testID: 'calendar-slot-540' });

    act(() => slot.props.onPress());
    expect(renderer.root.findByProps({ testID: 'calendar-selected-slot-frame' })).toBeDefined();
    expect(renderer.root.findAllByProps({ testID: 'calendar-create-sheet' })).toHaveLength(0);

    act(() => slot.props.onPress());
    const sheet = renderer.root.findByProps({ testID: 'calendar-create-sheet' });
    expect(sheet).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'calendar-create-start' }).props.value).toBe(
      '09:00',
    );
    expect(renderer.root.findByProps({ testID: 'calendar-create-end' }).props.value).toBe('09:30');
  });

  it('uses the phone 12-hour preference for slot and prefilled time copy', () => {
    mockState.uses24hourClock = false;
    const renderer = renderScreen();
    const slot = renderer.root.findByProps({ testID: 'calendar-slot-540' });

    expect(slot.props.accessibilityLabel).toMatch(/9:00.*AM/i);
    act(() => slot.props.onPress());
    act(() => slot.props.onPress());

    expect(renderer.root.findByProps({ testID: 'calendar-create-start' }).props.value).toMatch(
      /9:00.*AM/i,
    );
    expect(renderer.root.findByProps({ testID: 'calendar-create-end' }).props.value).toMatch(
      /9:30.*AM/i,
    );
  });

  it('moves selection to another slot instead of opening creation', () => {
    const renderer = renderScreen();
    const first = renderer.root.findByProps({ testID: 'calendar-slot-540' });
    const second = renderer.root.findByProps({ testID: 'calendar-slot-570' });

    act(() => first.props.onPress());
    act(() => second.props.onPress());

    expect(
      renderer.root.findByProps({ testID: 'calendar-selected-slot-frame' }).props
        .accessibilityValue,
    ).toEqual({ now: 570, min: 0, max: 1440 });
    expect(renderer.root.findAllByProps({ testID: 'calendar-create-sheet' })).toHaveLength(0);
  });

  it('clears slot selection on outside tap, scroll, and date change', () => {
    const renderer = renderScreen();
    const slot = renderer.root.findByProps({ testID: 'calendar-slot-540' });

    act(() => slot.props.onPress());
    const outside = renderer.root.findByProps({ testID: 'calendar-slot-clear-layer' });
    act(() => outside.props.onPress());
    expect(renderer.root.findAllByProps({ testID: 'calendar-selected-slot-frame' })).toHaveLength(
      0,
    );

    act(() => slot.props.onPress());
    const scroll = renderer.root.findByProps({ testID: 'calendar-timeline-scroll' });
    act(() => scroll.props.onScrollBeginDrag());
    expect(renderer.root.findAllByProps({ testID: 'calendar-selected-slot-frame' })).toHaveLength(
      0,
    );

    act(() => slot.props.onPress());
    const otherDate = renderer.root.findByProps({ testID: 'calendar-day-2026-09-01' });
    act(() => otherDate.props.onPress());
    expect(renderer.root.findAllByProps({ testID: 'calendar-selected-slot-frame' })).toHaveLength(
      0,
    );
  });

  it('starts a newly created future mission as reward eligible in the selected slot time zone', () => {
    const onCreateMission = vi.fn();
    mockState.deepLinkDate = '2026-09-07';
    mockState.timeZone = 'Asia/Hong_Kong';
    const renderer = renderScreen({
      now: new Date('2026-09-06T10:00:00.000Z'),
      onCreateMission,
    });
    const slot = renderer.root.findByProps({ testID: 'calendar-slot-540' });

    act(() => slot.props.onPress());
    act(() => slot.props.onPress());
    const title = renderer.root.findByProps({ testID: 'calendar-create-title' });
    act(() => title.props.onChangeText('Future mission'));
    const save = renderer.root.findByProps({ testID: 'calendar-create-save' });
    act(() => save.props.onPress());

    expect(onCreateMission).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Future mission',
        rewardEligibility: 'eligible',
        timeZone: 'Asia/Hong_Kong',
      }),
    );
  });
});

describe('MTS-044 past-create eligibility', () => {
  it('allows a mission exactly 30 days in the past, locks it to 0 XP after confirmation, and rejects anything older', () => {
    const onCreateMission = vi.fn();
    mockState.deepLinkDate = '2026-08-07';
    const renderer = renderScreen({
      now: new Date('2026-09-06T10:00:00.000Z'),
      onCreateMission,
    });
    const slot = renderer.root.findByProps({ testID: 'calendar-slot-600' });

    act(() => slot.props.onPress());
    act(() => slot.props.onPress());
    const title = renderer.root.findByProps({ testID: 'calendar-create-title' });
    act(() => title.props.onChangeText('Historical mission'));
    const save = renderer.root.findByProps({ testID: 'calendar-create-save' });
    act(() => save.props.onPress());

    expect(onCreateMission).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ testID: 'calendar-create-zero-xp-warning' })).toBeDefined();
    act(() => renderer.root.findByProps({ testID: 'calendar-create-confirm-zero-xp' }).props.onPress());

    expect(onCreateMission).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Historical mission',
        startMinute: 600,
        endMinute: 630,
        rewardEligibility: 'ineligible',
      }),
    );

    mockState.deepLinkDate = '2026-08-06';
    const tooOld = renderScreen({ now: new Date('2026-09-06T10:00:00.000Z') });
    expect(tooOld.root.findAllByProps({ testID: 'calendar-slot-600' })).toHaveLength(0);
  });

  it('evaluates the historical window in the phone mission time zone used by default save', () => {
    mockState.deepLinkDate = '2026-08-07';
    mockState.timeZone = 'Asia/Hong_Kong';
    const renderer = renderScreen({ now: new Date('2026-09-06T10:00:00.000Z') });

    expect(renderer.root.findAllByProps({ testID: 'calendar-slot-600' })).toHaveLength(0);
  });
});
