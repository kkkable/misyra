import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const gestureRuntime = vi.hoisted(() => ({ panConfigs: [] }));

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');
  const Pressable = ({ children, style, ...props }) =>
    createReactElement(
      'Pressable',
      { ...props, style: typeof style === 'function' ? style({ pressed: false }) : style },
      typeof children === 'function' ? children({ pressed: false }) : children,
    );
  return {
    Pressable,
    StyleSheet: { create: (styles) => styles },
    Text: 'Text',
    View: 'View',
  };
});

vi.mock('react-native-reanimated', async () => {
  const { createElement: createReactElement } = await import('react');
  return {
    default: { View: ({ children, ...props }) => createReactElement('AnimatedView', props, children) },
    useAnimatedStyle: (factory) => factory(),
    useSharedValue: (value) => ({ value }),
  };
});

vi.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn, ...args) => fn(...args),
}));

vi.mock('react-native-gesture-handler', async () => {
  const { createElement: createReactElement } = await import('react');
  return {
    GestureDetector: ({ children }) => createReactElement('GestureDetector', null, children),
    usePanGesture: (config) => {
      gestureRuntime.panConfigs.push(config);
      return { config };
    },
  };
});

import {
  MissionCard,
  TimedMissionLayer,
  buildMissionOverlapGroups,
} from './calendar-mission-layout.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function activeMission() {
  return {
    id: 'active',
    title: 'Active mission',
    startMinute: 540,
    endMinute: 600,
    orderKey: 'a',
    status: 'unfinished',
    rewardEligibility: 'eligible',
    timeZone: 'Asia/Hong_Kong',
  };
}

function draftMission() {
  return {
    id: 'draft',
    title: 'Draft mission',
    startMinute: 570,
    endMinute: 630,
    orderKey: 'b',
    status: 'unfinished',
    rewardEligibility: 'eligible',
    timeZone: 'Asia/Hong_Kong',
    previewKind: 'planner_draft',
  };
}

describe('MTS-088 Calendar draft preview', () => {
  it('keeps active and draft missions in the same overlap engine', () => {
    const groups = buildMissionOverlapGroups([activeMission(), draftMission()]);
    expect(groups).toHaveLength(1);
    expect(groups[0].cards.map((card) => card.mission.id)).toEqual(['active', 'draft']);
    expect(groups[0].cards.map((card) => card.widthPercent)).toEqual([50, 50]);
  });

  it.each(['light', 'dark'])('renders a Planner draft as a temporary outlined card in %s mode', (colorScheme) => {
    let renderer;
    act(() => {
      renderer = create(
        createElement(MissionCard, {
          colorScheme,
          language: 'en',
          mission: draftMission(),
          selected: false,
        }),
      );
    });

    const card = renderer.root.findByProps({ testID: 'calendar-mission-card-draft' });
    expect(card.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: 'transparent',
          borderStyle: 'dashed',
          borderWidth: 2,
        }),
      ]),
    );
    expect(card.props.accessibilityLabel).toContain('Draft');
  });

  it('reuses the existing timed mission move and resize gesture surfaces for Planner drafts', () => {
    gestureRuntime.panConfigs.length = 0;
    let renderer;
    act(() => {
      renderer = create(
        createElement(TimedMissionLayer, {
          colorScheme: 'light',
          language: 'en',
          missions: [draftMission()],
          now: new Date('2026-09-22T01:00:00.000Z'),
          onMissionAdjustment: vi.fn(),
          selectedDate: '2026-09-23',
          selectedMissionId: 'draft',
        }),
      );
    });

    expect(renderer.root.findByProps({ testID: 'calendar-mission-move-gesture-draft' })).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'calendar-mission-resize-handle-draft' })).toBeDefined();
    expect(gestureRuntime.panConfigs).toHaveLength(2);
  });
});
