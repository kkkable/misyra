import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const gestureRuntime = vi.hoisted(() => ({
  panConfigs: [],
}));

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
    StyleSheet: {
      create: (styles) => styles,
    },
    Text: 'Text',
    View: 'View',
  };
});

vi.mock('react-native-reanimated', async () => {
  const { createElement: createReactElement } = await import('react');
  return {
    default: {
      View: ({ children, ...props }) => createReactElement('AnimatedView', props, children),
    },
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

import { TimedMissionLayer } from './calendar-mission-layout.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function adjustableMission(id, status = 'unfinished') {
  return {
    id,
    title: `Mission ${id}`,
    startMinute: 540,
    endMinute: 600,
    orderKey: id,
    status,
    rewardEligibility: 'eligible',
    timeZone: 'UTC',
  };
}

function renderLayer({ missions, onMissionPress = vi.fn(), selectedMissionId }) {
  let renderer;
  act(() => {
    renderer = create(
      createElement(TimedMissionLayer, {
        colorScheme: 'light',
        language: 'en',
        missions,
        now: new Date('2026-09-07T08:00:00.000Z'),
        onMissionAdjustment: vi.fn(),
        onMissionPress,
        selectedDate: '2026-09-07',
        selectedMissionId,
      }),
    );
  });
  return renderer;
}

describe('MTS-047 rendered gesture arbitration', () => {
  it('keeps the mission card pressable while exposing a long-press move surface for an unfinished timed mission', () => {
    const onMissionPress = vi.fn();
    const mission = adjustableMission('move');
    const renderer = renderLayer({
      missions: [mission],
      onMissionPress,
      selectedMissionId: undefined,
    });

    act(() => {
      renderer.root.findByProps({ testID: 'calendar-mission-card-move' }).props.onPress();
    });
    expect(onMissionPress).toHaveBeenCalledWith(mission);
    expect(
      renderer.root.findByProps({ testID: 'calendar-mission-move-gesture-move' }),
    ).toBeDefined();
  });

  it('keeps pan callbacks on the UI runtime instead of opting the gesture into JS', () => {
    gestureRuntime.panConfigs.length = 0;
    renderLayer({
      missions: [adjustableMission('ui-thread')],
      selectedMissionId: 'ui-thread',
    });
    expect(gestureRuntime.panConfigs).toHaveLength(2);
    expect(gestureRuntime.panConfigs.every((config) => config.runOnJS !== true)).toBe(true);
  });

  it('shows the bottom resize handle only for the selected unfinished timed mission', () => {
    const selected = renderLayer({
      missions: [adjustableMission('selected')],
      selectedMissionId: 'selected',
    });
    const resizeHandle = selected.root.findByProps({
      testID: 'calendar-mission-resize-handle-selected',
    });
    expect(resizeHandle).toBeDefined();
    expect(
      resizeHandle.findAll(
        (node) =>
          node.type === 'View' && JSON.stringify(node.props.style).includes('currentColor'),
      ),
    ).toHaveLength(0);

    const unselected = renderLayer({
      missions: [adjustableMission('unselected')],
      selectedMissionId: undefined,
    });
    expect(
      unselected.root.findAllByProps({ testID: 'calendar-mission-resize-handle-unselected' }),
    ).toHaveLength(0);

    const completed = renderLayer({
      missions: [adjustableMission('completed', 'verified')],
      selectedMissionId: 'completed',
    });
    expect(
      completed.root.findAllByProps({ testID: 'calendar-mission-resize-handle-completed' }),
    ).toHaveLength(0);
  });
});
