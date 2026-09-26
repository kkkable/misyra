import type { LocalizationLocale } from './catalogs.js';

export type DeviceLanguageLocale = Readonly<{
  languageCode: string | null;
  languageScriptCode: string | null;
  regionCode?: string | null;
}>;

const TRADITIONAL_CHINESE_REGIONS = new Set(['HK', 'MO', 'TW']);

export function resolveLocalizationLocale(
  locale: DeviceLanguageLocale | undefined,
): LocalizationLocale {
  const languageCode = locale?.languageCode?.toLowerCase() ?? null;
  if (languageCode !== 'zh') return 'en';

  const scriptCode = locale?.languageScriptCode?.toLowerCase() ?? null;
  const regionCode = locale?.regionCode?.toUpperCase() ?? null;
  if (
    scriptCode === 'hant' ||
    (regionCode !== null && TRADITIONAL_CHINESE_REGIONS.has(regionCode))
  ) {
    return 'zh-HK';
  }

  return 'en';
}

function utcDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) throw new RangeError('Invalid date.');
  return value;
}

export function formatAppMonth(value: Date, language: LocalizationLocale): string {
  return new Intl.DateTimeFormat(language, {
    month: 'long',
    timeZone: 'UTC',
  }).format(utcDate(value));
}

export function formatAppWeekday(value: Date, language: LocalizationLocale): string {
  return new Intl.DateTimeFormat(language, {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(utcDate(value));
}

export function formatRegionalNumber(value: number, regionalLocale: string): string {
  if (!Number.isFinite(value)) throw new RangeError('Regional numbers must be finite.');
  return new Intl.NumberFormat(regionalLocale).format(value);
}

export function formatRegionalNumericDate(value: Date, regionalLocale: string): string {
  return new Intl.DateTimeFormat(regionalLocale, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcDate(value));
}
