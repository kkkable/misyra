import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');
  const ScrollView = ({ children, ...props }) => createReactElement('ScrollView', props, children);
  return {
    ScrollView,
    StyleSheet: { create: (styles) => styles },
    Text: 'Text',
    View: 'View',
  };
});

import { ProgressScreen } from './progress-screen.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const snapshot = {
  totalXp: 340,
  totalCompleted: 1_234,
  currentStreak: 12,
  longestStreak: 25,
  updatedAt: '2026-09-11T15:00:00.000Z',
};

const recent = [
  {
    occurrenceId: '11111111-1111-4111-8111-111111111111',
    title: 'Morning mission',
    completedAt: '2026-09-11T01:05:00.000Z',
    awardedXp: 50,
    payload: {},
    updatedAt: '2026-09-11T01:05:00.000Z',
  },
];

function renderScreen(props = {}) {
  let renderer;
  act(() => {
    renderer = create(
      createElement(ProgressScreen, {
        colorScheme: 'light',
        language: 'en',
        numberLocale: 'en-US',
        snapshot,
        recent,
        ...props,
      }),
    );
  });
  return renderer;
}

function textContent(renderer) {
  return renderer.root
    .findAllByType('Text')
    .map((node) => node.children.join(''))
    .join('\n');
}

describe('MTS-060 Progress screen', () => {
  it('shows only the approved minimal Progress information', () => {
    const renderer = renderScreen();
    const text = textContent(renderer);

    expect(text).toContain('Progress');
    expect(text).toContain('Level 3');
    expect(text).toContain('115 / 150 XP');
    expect(text).toContain('Current streak');
    expect(text).toContain('12');
    expect(text).toContain('Longest streak');
    expect(text).toContain('25');
    expect(text).toContain('Total completed');
    expect(text).toContain('1,234');
    expect(text).toContain('Recent completed');
    expect(text).toContain('Morning mission');
    expect(text).toContain('+50 XP');

    expect(text).not.toMatch(/chart|badge|achievement|trend|leaderboard/i);
  });

  it('uses the phone-region locale for Progress numbers independently of app language', () => {
    const renderer = renderScreen({
      numberLocale: 'de-DE',
      snapshot: {
        ...snapshot,
        currentStreak: 1_234,
        longestStreak: 2_345,
        totalCompleted: 12_345,
      },
    });
    const text = textContent(renderer);

    expect(text).toContain('1.234');
    expect(text).toContain('2.345');
    expect(text).toContain('12.345');
  });

  it('renders the approved zh-HK labels without adding analytics surfaces', () => {
    const renderer = renderScreen({ language: 'zh-HK', numberLocale: 'zh-HK' });
    const text = textContent(renderer);

    expect(text).toContain('進度');
    expect(text).toContain('等級 3');
    expect(text).toContain('目前連續紀錄');
    expect(text).toContain('最長連續紀錄');
    expect(text).toContain('完成任務總數');
    expect(text).toContain('最近完成');
    expect(text).not.toMatch(/圖表|徽章|成就|排行榜/);
  });
});
