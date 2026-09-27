import {
  localizationCatalogs,
  resolveLocalizationLocale,
  type DeviceLanguageLocale,
  type LocalizationLocale,
} from '@misyra/localization';

export function resolveAuthLocale(locale: DeviceLanguageLocale | undefined): LocalizationLocale {
  return resolveLocalizationLocale(locale);
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
