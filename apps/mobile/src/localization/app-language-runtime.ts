import { useEffect, useRef, useState } from 'react';
import { getLocales } from 'expo-localization';

import type { LocalizationLocale } from '@misyra/localization';

import { rootAuthStorage } from '../auth/auth-runtime.js';
import {
  resolveCalendarLanguage,
  resolveInitialCalendarLanguage,
} from '../calendar/calendar-language-runtime.js';
import { openMobileDatabase } from '../storage/database.js';
import { createLocalRepositories, type LocalRepositories } from '../storage/local-repositories.js';

const LANGUAGE_REFRESH_INTERVAL_MS = 60_000;
const INITIAL_SYNC_RECHECK_MS = 1_000;

const appLanguageListeners = new Set<(language: LocalizationLocale) => void>();

export function publishAppLanguage(language: LocalizationLocale): void {
  for (const listener of appLanguageListeners) listener(language);
}

export function useAppLanguage(): LocalizationLocale {
  const deviceLocale = useRef(getLocales()[0]).current;
  const [language, setLanguage] = useState<LocalizationLocale>(() =>
    resolveInitialCalendarLanguage(deviceLocale),
  );

  useEffect(() => {
    let active = true;
    const onPublishedLanguage = (nextLanguage: LocalizationLocale) => {
      if (active) setLanguage(nextLanguage);
    };
    appLanguageListeners.add(onPublishedLanguage);
    let repositories: LocalRepositories | null = null;
    let repositoryAccountId: string | null = null;
    let refreshInFlight: Promise<void> | null = null;

    const readSettings = async (accountId: string) => {
      if (repositories === null || repositoryAccountId !== accountId) {
        const database = await openMobileDatabase();
        repositories = createLocalRepositories(database, accountId);
        repositoryAccountId = accountId;
      }
      return repositories.settings.get();
    };

    const refreshLanguage = () => {
      if (refreshInFlight !== null) return refreshInFlight;
      refreshInFlight = resolveCalendarLanguage({
        deviceLocale,
        readSession: () => rootAuthStorage.read(),
        readSettings,
      })
        .then((resolution) => {
          if (active) publishAppLanguage(resolution.language);
        })
        .catch(() => undefined)
        .finally(() => {
          refreshInFlight = null;
        });
      return refreshInFlight;
    };

    void refreshLanguage();
    const initialSyncRecheck = setTimeout(() => {
      void refreshLanguage();
    }, INITIAL_SYNC_RECHECK_MS);
    const refreshInterval = setInterval(() => {
      void refreshLanguage();
    }, LANGUAGE_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      appLanguageListeners.delete(onPublishedLanguage);
      clearTimeout(initialSyncRecheck);
      clearInterval(refreshInterval);
    };
  }, [deviceLocale]);

  return language;
}
