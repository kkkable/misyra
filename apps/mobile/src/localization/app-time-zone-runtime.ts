import { useEffect, useRef, useState } from 'react';

import { rootAuthStorage } from '../auth/auth-runtime.js';
import { openMobileDatabase } from '../storage/database.js';
import { createLocalRepositories, type LocalRepositories } from '../storage/local-repositories.js';

const TIME_ZONE_REFRESH_INTERVAL_MS = 60_000;
const INITIAL_SYNC_RECHECK_MS = 1_000;

function deviceTimeZone(): string {
  const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof value === 'string' && value.length > 0 ? value : 'UTC';
}

export function useAppTimeZone(): string {
  const deviceZone = useRef(deviceTimeZone()).current;
  const [timeZone, setTimeZone] = useState(deviceZone);

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

    const refreshTimeZone = () => {
      if (refreshInFlight !== null) return refreshInFlight;
      refreshInFlight = rootAuthStorage
        .read()
        .then(async (session) => {
          if (session === null) return deviceZone;
          const settings = await readSettings(session.accountId);
          return settings?.appTimeZone ?? deviceZone;
        })
        .then((resolvedTimeZone) => {
          if (active) setTimeZone(resolvedTimeZone);
        })
        .catch(() => undefined)
        .finally(() => {
          refreshInFlight = null;
        });
      return refreshInFlight;
    };

    void refreshTimeZone();
    const initialSyncRecheck = setTimeout(() => {
      void refreshTimeZone();
    }, INITIAL_SYNC_RECHECK_MS);
    const refreshInterval = setInterval(() => {
      void refreshTimeZone();
    }, TIME_ZONE_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      clearTimeout(initialSyncRecheck);
      clearInterval(refreshInterval);
    };
  }, [deviceZone]);

  return timeZone;
}
