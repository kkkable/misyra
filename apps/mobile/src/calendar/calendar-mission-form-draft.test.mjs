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
  };
});

import { CalendarMissionFormSheet } from './calendar-mission-form-sheet.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('MTS-088 Planner draft mission form mode', () => {
  it('saves draft edits without reward confirmation or unsupported mission-only controls', () => {
    const onSubmit = vi.fn();
    let renderer;

    act(() => {
      renderer = create(
        createElement(CalendarMissionFormSheet, {
          colorScheme: 'light',
          creationSlotMinute: 9 * 60,
          initialInput: {
            selectedDate: '2026-09-08',
            title: 'Draft meeting',
            allDay: false,
            startMinute: 540,
            endMinute: 600,
            estimatedEffortMinutes: null,
            rewardEligibility: 'ineligible',
            timeZone: 'Asia/Hong_Kong',
            timeBehavior: 'local_time',
            recurrence: null,
            private: false,
            location: 'Central',
            notes: 'Preview only',
          },
          language: 'en',
          mode: 'planner_draft',
          now: new Date('2026-09-22T12:00:00.000Z'),
          onCancel: vi.fn(),
          onSubmit,
          selectedDate: '2026-09-08',
          timeZone: 'Asia/Hong_Kong',
          uses24HourClock: true,
        }),
      );
    });

    expect(
      renderer.root.findAllByProps({ testID: 'calendar-create-recurrence' }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ testID: 'calendar-create-travel-behavior' }),
    ).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'calendar-create-private' })).toHaveLength(0);

    act(() => {
      renderer.root.findByProps({ testID: 'calendar-create-save' }).props.onPress();
    });

    expect(
      renderer.root.findAllByProps({ testID: 'calendar-create-zero-xp-warning' }),
    ).toHaveLength(0);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        rewardEligibility: 'ineligible',
        timeBehavior: 'local_time',
        recurrence: null,
        private: false,
      }),
    );
  });

  it('exposes delete only when the draft editor supplies the callback', () => {
    const onDelete = vi.fn();
    let renderer;

    act(() => {
      renderer = create(
        createElement(CalendarMissionFormSheet, {
          colorScheme: 'light',
          creationSlotMinute: 9 * 60,
          initialInput: {
            selectedDate: '2026-09-23',
            title: 'Draft meeting',
            allDay: false,
            startMinute: 540,
            endMinute: 600,
            estimatedEffortMinutes: null,
            rewardEligibility: 'ineligible',
            timeZone: 'Asia/Hong_Kong',
            timeBehavior: 'local_time',
            recurrence: null,
            private: false,
            location: null,
            notes: null,
          },
          language: 'en',
          mode: 'planner_draft',
          now: new Date('2026-09-22T12:00:00.000Z'),
          onCancel: vi.fn(),
          onDelete,
          onSubmit: vi.fn(),
          selectedDate: '2026-09-23',
          timeZone: 'Asia/Hong_Kong',
          uses24HourClock: true,
        }),
      );
    });

    act(() => {
      renderer.root.findByProps({ testID: 'calendar-create-delete' }).props.onPress();
    });
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
