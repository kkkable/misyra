import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  scrollTo: vi.fn(),
}));

vi.mock('react-native', async () => {
  const {
    createElement: createReactElement,
    forwardRef,
    useImperativeHandle,
  } = await import('react');

  const ScrollView = forwardRef(function MockScrollView({ children, ...props }, ref) {
    useImperativeHandle(ref, () => ({ scrollTo: mockState.scrollTo }), []);
    return createReactElement('ScrollView', props, children);
  });

  return {
    ScrollView,
    StyleSheet: {
      create: (styles) => styles,
    },
    Text: 'Text',
    View: 'View',
  };
});

import {
  CurrentTimeRuler,
  TIMELINE_HEIGHT,
  TimedTimeline,
  buildTimelineGuides,
  timelineFrameForInterval,
  timelineYForMinute,
} from './calendar-timeline.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  mockState.scrollTo.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MTS-041 timeline coordinate model', () => {
  it('uses bounded half-hour guides while preserving exact-minute event geometry', () => {
    const guides = buildTimelineGuides();

    expect(guides).toHaveLength(48);
    expect(guides.filter((guide) => guide.label !== undefined)).toHaveLength(24);
    expect(guides[0]).toEqual({ label: '00:00', minute: 0, y: 0 });
    expect(guides[1]).toEqual({ minute: 30, y: 30 });
    expect(guides.at(-1)).toEqual({ minute: 1410, y: 1410 });
    expect(TIMELINE_HEIGHT).toBe(1440);

    expect(timelineYForMinute(9 * 60 + 7)).toBe(547);
    expect(timelineFrameForInterval(9 * 60 + 7, 9 * 60 + 52)).toEqual({
      height: 45,
      top: 547,
    });
  });

  it('rejects time coordinates outside the single rendered day', () => {
    expect(() => timelineYForMinute(-1)).toThrow(RangeError);
    expect(() => timelineYForMinute(1441)).toThrow(RangeError);
    expect(() => timelineFrameForInterval(600, 599)).toThrow(RangeError);
  });
});

describe('MTS-041 bounded rendered timeline', () => {
  it('renders only fixed hour/half-hour structure and scrolls with earlier launch context', () => {
    let renderer;
    act(() => {
      renderer = create(
        createElement(TimedTimeline, {
          colorScheme: 'light',
          initialCurrentMinute: 517,
          launchMinute: 600,
          selectedDate: '2026-09-07',
          today: '2026-09-06',
        }),
      );
    });

    const guides = renderer.root.findAll(
      (node) =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('calendar-time-guide-'),
    );
    const labels = renderer.root.findAll(
      (node) =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('calendar-hour-label-'),
    );
    const scroll = renderer.root.findByProps({ testID: 'calendar-timeline-scroll' });

    expect(guides).toHaveLength(48);
    expect(labels).toHaveLength(24);
    expect(scroll.props.contentOffset).toEqual({ x: 0, y: 570 });
    expect(renderer.root.findByProps({ testID: 'calendar-timeline-content' }).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 1440 })]),
    );
    expect(renderer.root.findAll(() => true).length).toBeLessThan(100);
  });

  it('keeps time anchors independent from scalable label typography', () => {
    let renderer;
    act(() => {
      renderer = create(
        createElement(TimedTimeline, {
          colorScheme: 'light',
          initialCurrentMinute: 517,
          launchMinute: 480,
          selectedDate: '2026-09-07',
          today: '2026-09-06',
        }),
      );
    });

    const nine = renderer.root.findByProps({ testID: 'calendar-hour-label-540' });
    expect(nine.props.allowFontScaling).toBe(true);
    expect(nine.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ top: 540 })]),
    );
  });
});

describe('MTS-042 all-day scroll composition', () => {
  it('keeps the all-day area in the same scroll surface while preserving the timed launch anchor', () => {
    let renderer;
    act(() => {
      renderer = create(
        createElement(TimedTimeline, {
          colorScheme: 'light',
          initialCurrentMinute: 517,
          launchMinute: 600,
          scrollHeader: createElement('AllDayHeader'),
          selectedDate: '2026-09-07',
          today: '2026-09-06',
        }),
      );
    });

    const scroll = renderer.root.findByProps({ testID: 'calendar-timeline-scroll' });
    expect(scroll.props.contentOffset).toEqual({ x: 0, y: 0 });
    const header = renderer.root.findByProps({ testID: 'calendar-scroll-header' });

    act(() => {
      header.props.onLayout({ nativeEvent: { layout: { height: 132 } } });
    });
    expect(mockState.scrollTo).toHaveBeenCalledWith({ animated: false, x: 0, y: 702 });

    act(() => {
      header.props.onLayout({ nativeEvent: { layout: { height: 220 } } });
    });
    expect(mockState.scrollTo).toHaveBeenCalledTimes(1);
  });
});

describe('MTS-041 current-time ruler isolation', () => {
  it('updates its minute without rerendering the parent timeline owner', () => {
    vi.useFakeTimers();
    let now = new Date(2026, 8, 6, 8, 37);
    const parentRender = vi.fn();

    function Harness() {
      parentRender();
      return createElement(CurrentTimeRuler, {
        colorScheme: 'light',
        initialMinute: 517,
        nowProvider: () => now,
        updateIntervalMs: 1_000,
      });
    }

    let renderer;
    act(() => {
      renderer = create(createElement(Harness));
    });

    expect(
      renderer.root.findByProps({ testID: 'calendar-current-time-ruler' }).props.accessibilityLabel,
    ).toBe('Current time, 08:37');

    now = new Date(2026, 8, 6, 8, 38);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(
      renderer.root.findByProps({ testID: 'calendar-current-time-ruler' }).props.accessibilityLabel,
    ).toBe('Current time, 08:38');
    expect(parentRender).toHaveBeenCalledTimes(1);
  });
});
