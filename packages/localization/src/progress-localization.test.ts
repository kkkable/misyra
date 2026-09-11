import { describe, expect, it } from 'vitest';

import { localizationCatalogs } from './catalogs.js';

const progressKeys = [
  'progress.title',
  'progress.level',
  'progress.xpTowardNext',
  'progress.currentStreak',
  'progress.longestStreak',
  'progress.totalCompleted',
  'progress.recentCompleted',
  'progress.emptyRecent',
] as const;

function progressCatalog(locale: 'en' | 'zh-HK') {
  const catalog = localizationCatalogs[locale] as Record<string, string>;
  return Object.fromEntries(progressKeys.map((key) => [key, catalog[key]]));
}

describe('MTS-060 Progress localization', () => {
  it('keeps English and Hong Kong Traditional Chinese Progress copy complete and minimal', () => {
    expect({
      en: progressCatalog('en'),
      'zh-HK': progressCatalog('zh-HK'),
    }).toMatchInlineSnapshot(`
      {
        "en": {
          "progress.currentStreak": "Current streak",
          "progress.emptyRecent": "No completed missions yet.",
          "progress.level": "Level {value}",
          "progress.longestStreak": "Longest streak",
          "progress.recentCompleted": "Recent completed",
          "progress.title": "Progress",
          "progress.totalCompleted": "Total completed",
          "progress.xpTowardNext": "XP toward next level",
        },
        "zh-HK": {
          "progress.currentStreak": "目前連續紀錄",
          "progress.emptyRecent": "尚未有已完成任務。",
          "progress.level": "等級 {value}",
          "progress.longestStreak": "最長連續紀錄",
          "progress.recentCompleted": "最近完成",
          "progress.title": "進度",
          "progress.totalCompleted": "完成任務總數",
          "progress.xpTowardNext": "下一等級 XP",
        },
      }
    `);
  });
});
