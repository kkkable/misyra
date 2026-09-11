import type { LocalizationLocale } from './catalogs.js';

export const progressLocalizationCatalogs = {
  en: {
    title: 'Progress',
    level: 'Level {value}',
    xpTowardNext: 'XP toward next level',
    currentStreak: 'Current streak',
    longestStreak: 'Longest streak',
    totalCompleted: 'Total completed',
    recentCompleted: 'Recent completed',
    emptyRecent: 'No completed missions yet.',
  },
  'zh-HK': {
    title: '進度',
    level: '等級 {value}',
    xpTowardNext: '下一等級 XP',
    currentStreak: '目前連續紀錄',
    longestStreak: '最長連續紀錄',
    totalCompleted: '完成任務總數',
    recentCompleted: '最近完成',
    emptyRecent: '尚未有已完成任務。',
  },
} as const satisfies Record<LocalizationLocale, Record<string, string>>;
