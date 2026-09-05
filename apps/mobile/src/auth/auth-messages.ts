import {
  localizationCatalogs,
  type LocalizationLocale,
} from '@misyra/localization';

type DeviceLocale = {
  readonly languageCode: string | null;
  readonly languageScriptCode: string | null;
  readonly regionCode?: string | null;
};

export function resolveAuthLocale(locale: DeviceLocale | undefined): LocalizationLocale {
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

export function authMessagesForLocale(locale: LocalizationLocale) {
  const catalog = localizationCatalogs[locale];

  return {
    title: catalog['auth.signIn.title'],
    apple: catalog['auth.signIn.apple'],
    google: catalog['auth.signIn.google'],
    signInFailed: catalog['auth.signIn.failed'],
  } as const;
}
