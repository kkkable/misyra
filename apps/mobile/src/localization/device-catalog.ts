/**
 * Device catalog resolution for the mobile shell (MTS-003).
 *
 * Resolves the localization catalog from the device locale on launch;
 * unsupported languages fall back to English (technical specification
 * section 25). Full user-controlled language selection arrives with the
 * Settings feature in a later ticket.
 */
import { getLocales } from "expo-localization";
import { catalogs, isSupportedLocale, type LocalizationCatalog } from "@misyra/localization";

/** Resolve the catalog matching the primary device locale, if any. */
export function deviceCatalog(): LocalizationCatalog {
  const primary = getLocales()[0];
  if (primary) {
    const candidates: string[] = [primary.languageTag];
    if (primary.languageCode && primary.languageRegionCode) {
      candidates.push(`${primary.languageCode}-${primary.languageRegionCode}`);
    }
    if (primary.languageCode) {
      candidates.push(primary.languageCode);
    }
    for (const candidate of candidates) {
      if (isSupportedLocale(candidate)) {
        return catalogs[candidate];
      }
    }
  }
  return catalogs.en;
}
