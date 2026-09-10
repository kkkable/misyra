import type { LocalizationLocale } from './catalogs.js';

const importedUntitledEventTitles: Readonly<Record<LocalizationLocale, string>> = {
  en: 'Untitled event',
  'zh-HK': '未命名活動',
};

export function importedEventDisplayTitle(
  providerTitle: string | null,
  language: LocalizationLocale,
): string {
  if (providerTitle !== null && providerTitle.trim().length > 0) {
    return providerTitle;
  }

  return importedUntitledEventTitles[language];
}
