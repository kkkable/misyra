import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  deepLinkDate: '2026-09-07',
  firstWeekday: 2,
  timeZone: 'Asia/Hong_Kong',
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
        language: 'en',
        now: new Date('2026-09-06T10:00:00.000Z'),
        ...props,
      }),
    );
  });
  return renderer;
}

function openSlot(renderer, minute = 540) {
  const slot = renderer.root.findByProps({ testID: `calendar-slot-${String(minute)}` });
  act(() => slot.props.onPress());
  act(() => slot.props.onPress());
}

beforeEach(() => {
  mockState.deepLinkDate = '2026-09-07';
  mockState.firstWeekday = 2;
  mockState.timeZone = 'Asia/Hong_Kong';
  mockState.uses24hourClock = true;
});

describe('MTS-045 mission form UI', () => {
  it('renders the approved fields and no category, attachment, or difficulty controls', () => {
    const renderer = renderScreen();
    openSlot(renderer);

    for (const testID of [
      'calendar-create-title',
      'calendar-create-date',
      'calendar-create-start',
      'calendar-create-end',
      'calendar-create-recurrence',
      'calendar-create-all-day',
      'calendar-create-time-zone',
      'calendar-create-travel-behavior',
      'calendar-create-private',
      'calendar-create-location',
      'calendar-create-notes',
    ]) {
      expect(renderer.root.findByProps({ testID })).toBeDefined();
    }

    expect(renderer.root.findAllByProps({ testID: 'calendar-create-category' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'calendar-create-attachment' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'calendar-create-difficulty' })).toHaveLength(0);
  });

  it('converts to all-day form state and requires an effort estimate before save', () => {
    const onCreateMission = vi.fn();
    const renderer = renderScreen({ onCreateMission });
    openSlot(renderer);

    act(() => renderer.root.findByProps({ testID: 'calendar-create-all-day' }).props.onPress());
    expect(renderer.root.findAllByProps({ testID: 'calendar-create-start' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'calendar-create-end' })).toHaveLength(0);
    const effort = renderer.root.findByProps({ testID: 'calendar-create-effort' });
    expect(effort).toBeDefined();

    act(() => renderer.root.findByProps({ testID: 'calendar-create-title' }).props.onChangeText('All day'));
    act(() => effort.props.onChangeText(''));
    act(() => renderer.root.findByProps({ testID: 'calendar-create-save' }).props.onPress());
    expect(onCreateMission).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ testID: 'calendar-create-validation-error' })).toBeDefined();

    act(() => effort.props.onChangeText('45'));
    act(() => renderer.root.findByProps({ testID: 'calendar-create-save' }).props.onPress());
    expect(onCreateMission).toHaveBeenCalledWith(
      expect.objectContaining({
        allDay: true,
        estimatedEffortMinutes: 45,
        startMinute: null,
        endMinute: null,
      }),
    );
  });

  it('requires explicit confirmation before saving a past mission at permanent 0 XP', () => {
    mockState.deepLinkDate = '2026-08-20';
    const onCreateMission = vi.fn();
    const renderer = renderScreen({ onCreateMission });
    openSlot(renderer, 600);

    act(() =>
      renderer.root.findByProps({ testID: 'calendar-create-title' }).props.onChangeText('Past mission'),
    );
    act(() => renderer.root.findByProps({ testID: 'calendar-create-save' }).props.onPress());

    expect(onCreateMission).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ testID: 'calendar-create-zero-xp-warning' })).toBeDefined();

    act(() => renderer.root.findByProps({ testID: 'calendar-create-confirm-zero-xp' }).props.onPress());
    expect(onCreateMission).toHaveBeenCalledWith(
      expect.objectContaining({ rewardEligibility: 'ineligible' }),
    );
  });
});
