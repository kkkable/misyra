export type MissionNotificationLocale = 'en' | 'zh-HK';

export const missionNotificationCatalogs = Object.freeze({
  en: Object.freeze({
    startsNow: '{title} starts now.',
    combinedStartsNow: '{count} missions start now',
  }),
  'zh-HK': Object.freeze({
    startsNow: '{title} 現在開始。',
    combinedStartsNow: '{count} 個任務現在開始',
  }),
} as const);

export function formatMissionStartsNow(locale: MissionNotificationLocale, title: string): string {
  return missionNotificationCatalogs[locale].startsNow.replace('{title}', title);
}

export function formatMissionCountStartsNow(
  locale: MissionNotificationLocale,
  count: number,
): string {
  if (!Number.isSafeInteger(count) || count < 2) {
    throw new RangeError('combined_notification_count');
  }
  return missionNotificationCatalogs[locale].combinedStartsNow.replace('{count}', String(count));
}
