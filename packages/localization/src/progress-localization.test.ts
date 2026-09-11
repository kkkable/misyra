import { describe, expect, it } from 'vitest';

import { progressLocalizationCatalogs } from './progress-catalogs.js';

describe('MTS-060 Progress localization', () => {
  it('keeps English and Hong Kong Traditional Chinese Progress copy complete and minimal', () => {
    expect(progressLocalizationCatalogs).toMatchInlineSnapshot(`
      {
        "en": {
          "currentStreak": "Current streak",
          "emptyRecent": "No completed missions yet.",
          "level": "Level {value}",
          "longestStreak": "Longest streak",
          "recentCompleted": "Recent completed",
          "title": "Progress",
          "totalCompleted": "Total completed",
          "xpTowardNext": "XP toward next level",
        },
        "zh-HK": {
          "currentStreak": "目前連續紀錄",
          "emptyRecent": "尚未有已完成任務。",
          "level": "等級 {value}",
          "longestStreak": "最長連續紀錄",
          "recentCompleted": "最近完成",
          "title": "進度",
          "totalCompleted": "完成任務總數",
          "xpTowardNext": "下一等級 XP",
        },
      }
    `);
  });
});
