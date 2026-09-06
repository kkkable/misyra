import { useCallback, useEffect, useRef, useState } from 'react';
import { getLocales } from 'expo-localization';

import type { LocalizationLocale } from '@misyra/localization';

import { rootAuthController, rootAuthStorage } from '../auth/auth-runtime.js';
import { openMobileDatabase } from '../storage/database.js';
import { createLocalRepositories, type LocalRepositories } from '../storage/local-repositories.js';
import { requireRegisteredDeviceId } from '../sync/root-sync-runtime.js';
import { CalendarDayScreen } from './calendar-day-screen.js';
import {
  resolveCalendarLanguage,
  resolveInitialCalendarLanguage,
} from './calendar-language-runtime.js';
import {
  createCalendarMission,
  type CalendarMissionCreateInput,
} from './calendar-mission-create.js';

const LANGUAGE_REFRESH_INTERVAL_MS = 60_000;
const INITIAL_SYNC_RECHECK_MS = 1_000;
const UUID_HEX = '0123456789abcdef';
const UUID_VARIANTS = '89ab';

function randomHex(length: number): string {
  return Array.from({ length }, () => UUID_HEX[Math.floor(Math.random() * UUID_HEX.length)]).join(
    '',
  );
}

function generateUuid(): string {
  const variant = UUID_VARIANTS.charAt(Math.floor(Math.random() * UUID_VARIANTS.length));
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${variant}${randomHex(3)}-${randomHex(12)}`;
}

export function CalendarRouteScreen() {
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

  const createMission = useCallback(async (input: CalendarMissionCreateInput) => {
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in') throw new Error('calendar_create_requires_sign_in');

    const deviceId = await requireRegisteredDeviceId(authState.session.accountId);
    const database = await openMobileDatabase();

    await createCalendarMission({
      database,
      accountId: authState.session.accountId,
      deviceId,
      input,
      now: new Date(),
      generateId: generateUuid,
    });
  }, []);

  return <CalendarDayScreen language={language} onCreateMission={createMission} />;
}
