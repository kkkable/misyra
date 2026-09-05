export const localizationCatalogs = {
  en: {
    'auth.signIn.title': 'Sign in to Misyra',
    'auth.signIn.apple': 'Continue with Apple',
    'auth.signIn.google': 'Continue with Google',
    'auth.signIn.failed': 'Sign-in failed. Please try again.',
    'onboarding.notifications.title': 'Mission reminders',
    'onboarding.notifications.body': 'Notifications can remind you when a mission starts.',
    'onboarding.notifications.enable': 'Enable notifications',
    'onboarding.notifications.notNow': 'Not now',
    'onboarding.calendar.title': 'Connect a calendar?',
    'onboarding.calendar.body': 'Optionally connect one calendar. You can also do this later in Settings.',
    'onboarding.calendar.apple': 'Apple Calendar',
    'onboarding.calendar.google': 'Google Calendar',
    'onboarding.calendar.skip': 'Skip for now',
    'sync.conflict.missionUpdated': 'This mission was updated on another device.',
    'sync.conflict.missionDeleted': 'This mission was deleted on another device.',
    'sync.conflict.missionCompletedElsewhere':
      'This mission was already completed on another device.',
    'sync.conflict.storyUpdated': 'This Story draft was updated on another device.',
  },
  'zh-HK': {
    'auth.signIn.title': '登入 Misyra',
    'auth.signIn.apple': '使用 Apple 繼續',
    'auth.signIn.google': '使用 Google 繼續',
    'auth.signIn.failed': '登入失敗，請再試一次。',
    'onboarding.notifications.title': '任務提醒',
    'onboarding.notifications.body': '通知可在任務開始時提醒你。',
    'onboarding.notifications.enable': '啟用通知',
    'onboarding.notifications.notNow': '暫時不要',
    'onboarding.calendar.title': '連接日曆？',
    'onboarding.calendar.body': '你可以選擇連接一個日曆，亦可稍後在設定中處理。',
    'onboarding.calendar.apple': 'Apple 日曆',
    'onboarding.calendar.google': 'Google 日曆',
    'onboarding.calendar.skip': '暫時略過',
    'sync.conflict.missionUpdated': '此任務已在另一部裝置上更新。',
    'sync.conflict.missionDeleted': '此任務已在另一部裝置上刪除。',
    'sync.conflict.missionCompletedElsewhere': '此任務已在另一部裝置上完成。',
    'sync.conflict.storyUpdated': '此 Story 草稿已在另一部裝置上更新。',
  },
} as const;

export type LocalizationLocale = keyof typeof localizationCatalogs;
export type LocalizationMessageKey = keyof (typeof localizationCatalogs)['en'];
