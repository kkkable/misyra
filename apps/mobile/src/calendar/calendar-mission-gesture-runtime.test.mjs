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
    StyleSheet: { create: (styles) => styles },
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
    useAnimatedStyle: (factory) =>
      new Proxy(
        {},
        {
          get: (_target, property) => factory()[property],
        },
      ),
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

function mission() {
  return {
    id: 'runtime',
    title: 'Runtime mission',
    startMinute: 540,
    endMinute: 600,
    orderKey: 'runtime',
    status: 'unfinished',
    rewardEligibility: 'eligible',
    timeZone: 'UTC',
  };
}

function renderLayer({
  now = new Date('2026-09-07T08:00:00.000Z'),
  getNow,
  onMissionAdjustment = vi.fn(),
  selectedDate = '2026-09-07',
} = {}) {
  gestureRuntime.panConfigs.length = 0;
  let renderer;
  act(() => {
    renderer = create(
      createElement(TimedMissionLayer, {
        colorScheme: 'light',
        language: 'en',
        missions: [mission()],
        now,
        getNow,
        onMissionAdjustment,
        selectedDate,
        selectedMissionId: 'runtime',
      }),
    );
  });
  return { renderer, onMissionAdjustment };
}

function moveGesture() {
  expect(gestureRuntime.panConfigs).toHaveLength(2);
  return gestureRuntime.panConfigs[1];
}

describe('MTS-047 rendered adjustment runtime', () => {
  it('keeps the snapped optimistic frame after release instead of jumping back to stale props', () => {
    const { renderer, onMissionAdjustment } = renderLayer();
    const animated = renderer.root.findByProps({
      testID: 'calendar-mission-move-gesture-runtime',
    });
    const animatedStyle = animated.props.style[1];
    const gesture = moveGesture();

    act(() => {
      gesture.onActivate();
      gesture.onUpdate({ translationY: 17 });
    });
    expect(animatedStyle.top).toBe(557);

    act(() => {
      gesture.onDeactivate({ translationY: 17, canceled: false });
    });

    expect(onMissionAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ allowed: true, startMinute: 555, endMinute: 615 }),
    );
    expect(animatedStyle.top).toBe(555);
    expect(animatedStyle.height).toBe(60);
  });

  it('evaluates after-start XP loss using release-time now rather than a render-time snapshot', () => {
    const getNow = vi.fn(() => new Date('2026-09-07T10:00:00.000Z'));
    const { onMissionAdjustment } = renderLayer({ getNow });
    const gesture = moveGesture();

    act(() => {
      gesture.onActivate();
      gesture.onUpdate({ translationY: 120 });
      gesture.onDeactivate({ translationY: 120, canceled: false });
    });

    expect(getNow).toHaveBeenCalled();
    expect(onMissionAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed: true,
        startMinute: 660,
        endMinute: 720,
        rewardEligibility: 'ineligible',
        warning: 'after_start_zero_xp',
      }),
    );
  });
});
