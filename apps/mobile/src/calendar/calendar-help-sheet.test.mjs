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
  return {
    Modal: 'Modal',
    Pressable,
    ScrollView: 'ScrollView',
    StyleSheet: {
      absoluteFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
      create: (styles) => styles,
      hairlineWidth: 1,
    },
    Text: 'Text',
    View: 'View',
  };
});

import { CalendarHelpSheet } from './calendar-help-sheet.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function textContent(node) {
  if (typeof node === 'string') return node;
  if (node === null || node === undefined) return '';
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  return textContent(node.children ?? []);
}

function renderSheet({ language = 'en', onDismiss = vi.fn(), onFaqPress = vi.fn() } = {}) {
  let renderer;
  act(() => {
    renderer = create(
      createElement(CalendarHelpSheet, {
        colorScheme: 'light',
        language,
        onDismiss,
        onFaqPress,
        visible: true,
      }),
    );
  });
  return { renderer, onDismiss, onFaqPress };
}

describe('MTS-050 Calendar help bottom sheet', () => {
  it('renders every approved contextual guide topic in English and zh-HK', () => {
    const english = renderSheet().renderer;
    const chinese = renderSheet({ language: 'zh-HK' }).renderer;

    const englishText = textContent(english.toJSON());
    expect(englishText).toContain('Calendar help');
    expect(englishText).toContain('Transparent — Unfinished');
    expect(englishText).toContain('Green — Accepted evidence, on time');
    expect(englishText).toContain('Amber — Accepted late or self-confirmed');
    expect(englishText).toContain('Purple — Private or Trust Mode completion');
    expect(englishText).toContain('Repeating missions');
    expect(englishText).toContain('this and future');
    expect(englishText).toContain('Tap a time slot twice');
    expect(englishText).toContain('Drag or resize');
    expect(englishText).toContain('Completion opens at the scheduled start');
    expect(englishText).toContain('30 days after the scheduled finish');
    expect(english.root.findByProps({ testID: 'calendar-help-faq' })).toBeDefined();

    const chineseText = textContent(chinese.toJSON());
    expect(chineseText).toContain('日曆說明');
    expect(chineseText).toContain('透明 — 未完成');
    expect(chineseText).toContain('綠色 — 證據已接納，準時完成');
    expect(chineseText).toContain('琥珀色 — 逾時完成或自行確認');
    expect(chineseText).toContain('紫色 — 私人或信任模式完成');
    expect(chineseText).toContain('重複任務');
    expect(chineseText).toContain('今次及之後');
    expect(chineseText).toContain('連按時間位置兩次');
    expect(chineseText).toContain('拖動或調整任務卡大小');
    expect(chineseText).toContain('任務到預定開始時間即可完成');
    expect(chineseText).toContain('預定結束時間後 30 日');
  });

  it('dismisses from the close button and outside backdrop and forwards the FAQ action', () => {
    const { renderer, onDismiss, onFaqPress } = renderSheet();

    act(() => renderer.root.findByProps({ testID: 'calendar-help-close' }).props.onPress());
    expect(onDismiss).toHaveBeenCalledTimes(1);

    const backdrop = renderer.root.findByProps({ accessibilityLabel: 'Dismiss Calendar help' });
    act(() => backdrop.props.onPress());
    expect(onDismiss).toHaveBeenCalledTimes(2);

    act(() => renderer.root.findByProps({ testID: 'calendar-help-faq' }).props.onPress());
    expect(onFaqPress).toHaveBeenCalledTimes(1);
  });

  it('dismisses on a deliberate downward swipe of the sheet handle but ignores short movement', () => {
    const { renderer, onDismiss } = renderSheet();
    const handle = renderer.root.findByProps({ testID: 'calendar-help-swipe-handle' });

    act(() => {
      handle.props.onTouchStart({ nativeEvent: { pageY: 100 } });
      handle.props.onTouchEnd({ nativeEvent: { pageY: 124 } });
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      handle.props.onTouchStart({ nativeEvent: { pageY: 100 } });
      handle.props.onTouchEnd({ nativeEvent: { pageY: 168 } });
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
