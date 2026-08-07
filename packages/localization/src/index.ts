/**
 * Public entry for the Misyra localization boundary (MTS-003).
 *
 * Supports exactly `en` and `zh-HK`; unsupported locales fall back to
 * English (technical specification section 25). MTS-003 ships only the
 * minimal scaffold strings needed by the placeholder tabs.
 */
import { en } from "./catalogs/en.js";
import { zhHK } from "./catalogs/zh-hk.js";

/** Every localization key known to the scaffold catalogs. */
export type LocalizationKey = keyof typeof en;

/** A read-only mapping from every key to its localized value. */
export type LocalizationCatalog = Readonly<Record<LocalizationKey, string>>;

/** Locales supported by the first release. */
export type SupportedLocale = "en" | "zh-HK";

/** Locales supported by the first release, in canonical order. */
export const supportedLocales: readonly SupportedLocale[] = ["en", "zh-HK"];

/** Full catalog inventory for every supported locale. */
export const catalogs: Record<SupportedLocale, LocalizationCatalog> = {
  en,
  "zh-HK": zhHK,
};

/**
 * Type guard for the supported locale inventory.
 *
 * @param locale any locale identifier.
 */
export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return supportedLocales.includes(locale as SupportedLocale);
}

/**
 * Resolve the catalog for a locale identifier, falling back to English for
 * unsupported languages and regions.
 *
 * @param locale any locale identifier, for example from the device.
 */
export function resolveCatalog(locale: string): LocalizationCatalog {
  if (isSupportedLocale(locale)) {
    return catalogs[locale];
  }
  return catalogs.en;
}

/**
 * Translate a single key against an already-resolved catalog.
 *
 * @param catalog resolved catalog for the active locale.
 * @param key localization key to look up.
 */
export function translate(catalog: LocalizationCatalog, key: LocalizationKey): string {
  return catalog[key];
}
