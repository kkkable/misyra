import type { LocalizationLocale } from './catalogs.js';

const appTimeZoneUpdatedTemplates: Readonly<Record<LocalizationLocale, string>> = {
  en: 'Time zone updated to {timeZone}.',
  'zh-HK': '時區已更新為 {timeZone}。',
};

export function appTimeZoneUpdatedMessage(language: LocalizationLocale, timeZone: string): string {
  return appTimeZoneUpdatedTemplates[language].replace('{timeZone}', timeZone);
}
