import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');

  const Pressable = ({ children, style, ...props }) =>
    createReactElement(
      'Pressable',
      {
        ...props,
        style: typeof style === 'function' ? style({ pressed: false }) : style,
      },
      typeof children === 'function' ? children({ pressed: false }) : children,
    );

  return {
    Pressable,
    StyleSheet: { create: (styles) => styles },
    Text: 'Text',
    View: 'View',
  };
});

import { AllDayMissionList } from './calendar-all-day.js';
import { TimedMissionLayer } from './calendar-mission-layout.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function timedMission(id, startMinute) {
  return {
    id,
    title: `Mission ${id}`,
    startMinute,
    endMinute: startMinute + 30,
    orderKey: id,
    status: 'verified',
    rewardEligibility: 'eligible',
    timeZone: 'Asia/Hong_Kong',
  };
}

describe('MTS-064 Calendar highlights from combined notifications', () => {
  it('draws a focus ring around every highlighted timed mission', () => {
    let renderer;
    act(() => {
      renderer = create(
        createElement(TimedMissionLayer, {
          colorScheme: 'light',
          highlightedMissionIds: ['first', 'second'],
          language: 'en',
          missions: [timedMission('first', 540), timedMission('second', 600)],
          now: new Date('2026-09-14T00:00:00.000Z'),
          selectedDate: '2026-09-14',
        }),
      );
    });

    for (const id of ['first', 'second']) {
      const card = renderer.root.findByProps({ testID: `calendar-mission-card-${id}` });
      expect(card.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ borderWidth: 2 })]),
      );
    }
  });

  it('expands the all-day list when needed and highlights every requested mission', () => {
    const missions = ['first', 'second', 'third', 'fourth', 'fifth'].map((id, index) => ({
      id,
      title: id,
      orderKey: String(index).padStart(2, '0'),
      completed: false,
    }));
    let renderer;
    act(() => {
      renderer = create(
        createElement(AllDayMissionList, {
          colorScheme: 'light',
          highlightedMissionIds: ['fourth', 'fifth'],
          missions,
          selectedDate: '2026-09-14',
        }),
      );
    });

    expect(renderer.root.findAllByProps({ testID: 'calendar-all-day-more' })).toHaveLength(0);
    for (const id of ['fourth', 'fifth']) {
      const card = renderer.root.findByProps({ testID: `calendar-all-day-mission-${id}` });
      expect(card.props.accessibilityState).toEqual({ selected: true });
      expect(card.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ borderWidth: 2 })]),
      );
    }
  });
});
