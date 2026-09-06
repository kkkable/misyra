import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-HK' }],
}));

vi.mock('@misyra/localization', () => ({
  localizationCatalogs: {
    en: {
      'calendar.allDay.more': 'Remaining {count}',
    },
    'zh-HK': {
      'calendar.allDay.more': '其餘 {count} 項',
    },
  },
}));

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
    StyleSheet: {
      create: (styles) => styles,
    },
    Text: 'Text',
    View: 'View',
  };
});

import {
  AllDayMissionList,
  orderAllDayMissions,
  visibleAllDayMissions,
} from './calendar-all-day.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const missions = [
  { id: 'late-created', title: 'Late created', orderKey: '003', completed: false },
  { id: 'first-imported', title: 'First imported', orderKey: '001', completed: false },
  { id: 'second-created', title: 'Second created', orderKey: '002', completed: true },
  { id: 'fourth', title: 'Fourth', orderKey: '004', completed: false },
  { id: 'fifth', title: 'Fifth', orderKey: '005', completed: false },
];

function renderList(props = {}) {
  let renderer;
  act(() => {
    renderer = create(
      createElement(AllDayMissionList, {
        colorScheme: 'light',
        missions,
        onMissionPress: vi.fn(),
        selectedDate: '2026-09-06',
        ...props,
      }),
    );
  });
  return renderer;
}

function renderedMissionCards(renderer) {
  return renderer.root.findAll(
    (node) =>
      node.type === 'Pressable' &&
      typeof node.props.testID === 'string' &&
      node.props.testID.startsWith('calendar-all-day-mission-'),
  );
}

describe('MTS-042 stable all-day ordering', () => {
  it('uses the stable creation/import ordering key and ignores completion state', () => {
    expect(orderAllDayMissions(missions).map((mission) => mission.id)).toEqual([
      'first-imported',
      'second-created',
      'late-created',
      'fourth',
      'fifth',
    ]);

    const changedCompletion = missions.map((mission) => ({
      ...mission,
      completed: !mission.completed,
    }));
    expect(orderAllDayMissions(changedCompletion).map((mission) => mission.id)).toEqual([
      'first-imported',
      'second-created',
      'late-created',
      'fourth',
      'fifth',
    ]);
  });

  it('caps the collapsed projection at three missions and reports the remainder', () => {
    const collapsed = visibleAllDayMissions(missions, false);
    expect(collapsed.missions.map((mission) => mission.id)).toEqual([
      'first-imported',
      'second-created',
      'late-created',
    ]);
    expect(collapsed.hiddenCount).toBe(2);
    expect(visibleAllDayMissions(missions, true).hiddenCount).toBe(0);
    expect(visibleAllDayMissions(missions, true).missions).toHaveLength(5);
  });
});

describe('MTS-042 all-day expansion and accessibility', () => {
  it('renders three tappable scalable cards plus catalog-backed +N more, then expands within the same surface', () => {
    const onMissionPress = vi.fn();
    const renderer = renderList({ onMissionPress });

    expect(renderedMissionCards(renderer)).toHaveLength(3);
    const more = renderer.root.findByProps({ testID: 'calendar-all-day-more' });
    expect(more.props.accessibilityLabel).toBe('Remaining 2');

    act(() => more.props.onPress());
    expect(renderedMissionCards(renderer)).toHaveLength(5);
    expect(renderer.root.findAllByProps({ testID: 'calendar-all-day-more' })).toHaveLength(0);

    const first = renderer.root.find(
      (node) =>
        node.type === 'Pressable' &&
        node.props.testID === 'calendar-all-day-mission-first-imported',
    );
    expect(first.props.accessibilityRole).toBe('button');
    expect(first.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ minHeight: 44 })]),
    );
    expect(first.findByType('Text').props.allowFontScaling).toBe(true);

    act(() => first.props.onPress());
    expect(onMissionPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'first-imported' }));
  });

  it('resets expansion when the selected date changes and never renders a permanent heading', () => {
    const renderer = renderList();
    act(() => renderer.root.findByProps({ testID: 'calendar-all-day-more' }).props.onPress());
    expect(renderedMissionCards(renderer)).toHaveLength(5);

    act(() => {
      renderer.update(
        createElement(AllDayMissionList, {
          colorScheme: 'light',
          missions,
          onMissionPress: vi.fn(),
          selectedDate: '2026-09-07',
        }),
      );
    });

    expect(renderedMissionCards(renderer)).toHaveLength(3);
    expect(renderer.root.findAllByProps({ testID: 'calendar-all-day-heading' })).toHaveLength(0);

    act(() => {
      renderer.update(
        createElement(AllDayMissionList, {
          colorScheme: 'light',
          missions,
          onMissionPress: vi.fn(),
          selectedDate: '2026-09-06',
        }),
      );
    });
    expect(renderedMissionCards(renderer)).toHaveLength(3);
  });
});
