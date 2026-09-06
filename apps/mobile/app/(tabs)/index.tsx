import { useEffect, useRef, useState } from 'react';
import { getLocales } from 'expo-localization';

import type { LocalizationLocale } from '@misyra/localization';

import { rootAuthStorage } from '../../src/auth/auth-runtime.js';
import { CalendarDayScreen } from '../../src/calendar/calendar-day-screen.js';
import {
  resolveCalendarLanguage,
  resolveInitialCalendarLanguage,
} from '../../src/calendar/calendar-language-runtime.js';
import { openMobileDatabase } from '../../src/storage/database.js';
import {
  createLocalRepositories,
  type LocalRepositories,
} from '../../src/storage/local-repositories.js';

const LANGUAGE_REFRESH_INTERVAL_MS = 60_000;
const INITIAL_SYNC_RECHECK_MS = 1_000;

export default function CalendarRoute() {
  const deviceLocale = useRef(getLocales()[0]).current;
  const [language, setLanguage] = useState<LocalizationLocale>(() =>
    resolveInitialCalendarLanguage(deviceLocale),
  );

  useEffect(() => {
    let active = true;
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
          if (active) setLanguage(resolution.language);
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
      clearTimeout(initialSyncRecheck);
      clearInterval(refreshInterval);
    };
  }, [deviceLocale]);

  return <CalendarDayScreen language={language} />;
}
