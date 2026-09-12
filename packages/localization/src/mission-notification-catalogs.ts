export type MissionNotificationLocale = 'en' | 'zh-HK';

export const missionNotificationCatalogs = Object.freeze({
  en: Object.freeze({
    startsNow: '{title} starts now.',
  }),
  'zh-HK': Object.freeze({
    startsNow: '{title} 現在開始。',
  }),
} as const);

export function formatMissionStartsNow(locale: MissionNotificationLocale, title: string): string {
  return missionNotificationCatalogs[locale].startsNow.replace('{title}', title);
}
