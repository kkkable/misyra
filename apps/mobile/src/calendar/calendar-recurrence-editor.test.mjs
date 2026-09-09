import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({ fontScale: 1 }));

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
    useWindowDimensions: () => ({
      width: 393,
      height: 852,
      scale: 3,
      fontScale: mockState.fontScale,
    }),
  };
});

import { CalendarMissionFormSheet } from './calendar-mission-form-sheet.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderForm({ language = 'en', onSubmit = vi.fn(), weekStartsOn = 1 } = {}) {
  let renderer;
  act(() => {
    renderer = create(
      createElement(CalendarMissionFormSheet, {
        colorScheme: 'light',
        creationSlotMinute: 9 * 60,
        language,
        now: new Date('2026-09-07T12:00:00.000Z'),
        onCancel: vi.fn(),
        onSubmit,
        selectedDate: '2026-09-08',
        timeZone: 'Asia/Hong_Kong',
        uses24HourClock: true,
        weekStartsOn,
      }),
    );
  });
  return { renderer, onSubmit };
}

function openRecurrence(renderer) {
  act(() => {
    renderer.root.findByProps({ testID: 'calendar-create-more-options' }).props.onPress();
  });
  const recurrence = renderer.root.findByProps({ testID: 'calendar-create-recurrence' });
  expect(recurrence.props.accessibilityRole).toBe('button');
  act(() => {
    recurrence.props.onPress();
  });
  return renderer.root.findByProps({ testID: 'calendar-recurrence-editor' });
}

function textSnapshot(node) {
  const values = [];
  const visit = (value) => {
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized.length > 0) values.push(normalized);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    value?.children?.forEach(visit);
  };
  visit(node);
  return values.join(' | ');
}

function setTitle(renderer, title) {
  act(() => {
    renderer.root.findByProps({ testID: 'calendar-create-title' }).props.onChangeText(title);
  });
}

function saveMission(renderer) {
  act(() => {
    renderer.root.findByProps({ testID: 'calendar-create-save' }).props.onPress();
  });
}

beforeEach(() => {
  mockState.fontScale = 1;
});

describe('MTS-051 recurrence editor UI', () => {
  it('shows the approved presets and ending modes in English and zh-HK without unsupported pause or exception controls', () => {
    const english = renderForm().renderer;
    const englishEditor = openRecurrence(english);
    expect(textSnapshot(englishEditor)).toMatchInlineSnapshot(
      `"Repeat | Does not repeat | Daily | Weekly | Monthly | Yearly | Custom | Ends | Never | On date | After count | Cancel | Done"`,
    );
    expect(english.root.findAllByProps({ testID: 'recurrence-pause' })).toHaveLength(0);
    expect(english.root.findAllByProps({ testID: 'recurrence-exception-dates' })).toHaveLength(0);

    const chinese = renderForm({ language: 'zh-HK' }).renderer;
    const chineseEditor = openRecurrence(chinese);
    expect(textSnapshot(chineseEditor)).toMatchInlineSnapshot(
      `"重複 | 不重複 | 每日 | 每週 | 每月 | 每年 | 自訂 | 結束 | 永不 | 於日期 | 完成次數後 | 取消 | 完成"`,
    );
  });

  it('saves a monthly ordinal recurrence with an interval and actual occurrence-count ending', () => {
    const { renderer, onSubmit } = renderForm();
    openRecurrence(renderer);

    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-preset-monthly' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-monthly-ordinal' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-interval' }).props.onChangeText('2');
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-end-count' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-end-count-input' }).props.onChangeText('7');
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-done' }).props.onPress();
    });

    setTitle(renderer, 'Second Tuesday mission');
    saveMission(renderer);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: {
          pattern: { type: 'monthly-ordinal', interval: 2, ordinal: 2, weekday: 2 },
          end: { type: 'count', occurrenceCount: 7 },
        },
      }),
    );
  });

  it('supports yearly ordinal weekday/month and an inclusive ending date', () => {
    const { renderer, onSubmit } = renderForm();
    openRecurrence(renderer);

    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-preset-yearly' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-yearly-ordinal' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-month' }).props.onChangeText('12');
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-ordinal-last' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-weekday-5' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-end-date' }).props.onPress();
    });
    act(() => {
      renderer.root
        .findByProps({ testID: 'recurrence-end-date-input' })
        .props.onChangeText('2027-12-31');
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-done' }).props.onPress();
    });

    setTitle(renderer, 'Last Friday of December');
    saveMission(renderer);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: {
          pattern: { type: 'yearly-ordinal', interval: 1, month: 12, ordinal: -1, weekday: 5 },
          end: { type: 'date', inclusiveLocalDate: '2027-12-31' },
        },
      }),
    );
  });

  it('supports Custom weekly intervals on selected weekdays with a Monday regional week start', () => {
    const { renderer, onSubmit } = renderForm({ weekStartsOn: 1 });
    openRecurrence(renderer);

    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-preset-custom' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-custom-weekly' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-interval' }).props.onChangeText('3');
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-weekday-2' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-weekday-1' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-weekday-3' }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-done' }).props.onPress();
    });

    setTitle(renderer, 'Mon Wed rotation');
    saveMission(renderer);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: {
          pattern: { type: 'weekly', interval: 3, weekdays: [1, 3], weekStartsOn: 1 },
          end: { type: 'never' },
        },
      }),
    );
  });

  it('orders and labels weekday choices from a Sunday regional week start and persists that phase', () => {
    const { renderer, onSubmit } = renderForm({ weekStartsOn: 0 });
    openRecurrence(renderer);

    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-preset-weekly' }).props.onPress();
    });

    const weekdayButtons = renderer.root.findAll(
      (node) =>
        node.type === 'Pressable' &&
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('recurrence-weekday-'),
    );
    expect(weekdayButtons.map((node) => node.props.testID)).toEqual([
      'recurrence-weekday-0',
      'recurrence-weekday-1',
      'recurrence-weekday-2',
      'recurrence-weekday-3',
      'recurrence-weekday-4',
      'recurrence-weekday-5',
      'recurrence-weekday-6',
    ]);
    expect(weekdayButtons.map((node) => node.props.accessibilityLabel)).toEqual([
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]);
    expect(textSnapshot(renderer.root.findByProps({ testID: 'calendar-recurrence-editor' }))).toContain(
      'Sun | Mon | Tue | Wed | Thu | Fri | Sat',
    );

    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-done' }).props.onPress();
    });
    setTitle(renderer, 'Regional weekly mission');
    saveMission(renderer);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: {
          pattern: { type: 'weekly', interval: 1, weekdays: [2], weekStartsOn: 0 },
          end: { type: 'never' },
        },
      }),
    );
  });

  it('uses localized weekday names in zh-HK instead of numeric domain values', () => {
    const renderer = renderForm({ language: 'zh-HK', weekStartsOn: 1 }).renderer;
    openRecurrence(renderer);
    act(() => {
      renderer.root.findByProps({ testID: 'recurrence-preset-weekly' }).props.onPress();
    });

    const monday = renderer.root.findByProps({ testID: 'recurrence-weekday-1' });
    expect(monday.props.accessibilityLabel).toBe('星期一');
    expect(textSnapshot(monday)).toBe('一');
  });

  it('keeps recurrence controls readable at 2x font scale and opts visible text into font scaling', () => {
    mockState.fontScale = 2;
    const renderer = renderForm().renderer;
    const editor = openRecurrence(renderer);

    expect(renderer.root.findByProps({ testID: 'recurrence-preset-custom' })).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'recurrence-end-count' })).toBeDefined();
    for (const text of editor.findAllByType('Text')) {
      expect(text.props.allowFontScaling).toBe(true);
    }
  });
});
