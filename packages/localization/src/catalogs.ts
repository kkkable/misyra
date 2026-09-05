export const localizationCatalogs = {
  en: {
    'sync.conflict.missionUpdated': 'This mission was updated on another device.',
    'sync.conflict.missionDeleted': 'This mission was deleted on another device.',
    'sync.conflict.missionCompletedElsewhere':
      'This mission was already completed on another device.',
    'sync.conflict.storyUpdated': 'This Story draft was updated on another device.',
  },
  'zh-HK': {
    'sync.conflict.missionUpdated': '此任務已在另一部裝置上更新。',
    'sync.conflict.missionDeleted': '此任務已在另一部裝置上刪除。',
    'sync.conflict.missionCompletedElsewhere': '此任務已在另一部裝置上完成。',
    'sync.conflict.storyUpdated': '此 Story 草稿已在另一部裝置上更新。',
  },
} as const;

export type LocalizationLocale = keyof typeof localizationCatalogs;
export type LocalizationMessageKey = keyof (typeof localizationCatalogs)['en'];
