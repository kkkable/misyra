import type { LocalizationLocale } from '@misyra/localization';

export type DeviceLanguageLocale = Readonly<{
  languageCode: string | null;
  languageScriptCode: string | null;
  regionCode?: string | null;
}>;

type CalendarLanguageSession = Readonly<{
  accountId: string;
}>;

type CalendarLanguageSettings = Readonly<{
  language: LocalizationLocale;
}>;

export type CalendarLanguageResolution = Readonly<{
  language: LocalizationLocale;
  persisted: boolean;
}>;

export function resolveInitialCalendarLanguage(
  locale: DeviceLanguageLocale | undefined,
): LocalizationLocale {
  if (locale?.languageCode !== 'zh') return 'en';

  if (
    locale.languageScriptCode === 'Hant' ||
    locale.regionCode === 'HK' ||
    locale.regionCode === 'MO' ||
    locale.regionCode === 'TW'
  ) {
    return 'zh-HK';
  }

  return 'en';
}

export async function resolveCalendarLanguage({
  deviceLocale,
  readSession,
  readSettings,
}: Readonly<{
  deviceLocale: DeviceLanguageLocale | undefined;
  readSession: () => Promise<CalendarLanguageSession | null>;
  readSettings: (accountId: string) => Promise<CalendarLanguageSettings | null>;
}>): Promise<CalendarLanguageResolution> {
  const fallback = resolveInitialCalendarLanguage(deviceLocale);
  const session = await readSession();
  if (session === null) return { language: fallback, persisted: false };

  const settings = await readSettings(session.accountId);
  return settings === null
    ? { language: fallback, persisted: false }
    : { language: settings.language, persisted: true };
}
