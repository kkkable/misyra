import { useCallback, useState } from 'react';
import { getLocales } from 'expo-localization';
import { useFocusEffect } from 'expo-router';
import { useColorScheme } from 'react-native';

import { rootAuthController } from '../auth/auth-runtime.js';
import type { ColorScheme } from '../design-system/contracts.js';
import { useAppLanguage } from '../localization/use-app-language.js';
import { openMobileDatabase } from '../storage/database.js';
import { createLocalRepositories, type ProgressSnapshot } from '../storage/local-repositories.js';
import { rootSyncRuntime } from '../sync/root-sync-runtime.js';
import { ProgressScreen, type ProgressRecentItem } from './progress-screen.js';

const RECENT_COMPLETION_LIMIT = 20;
const EMPTY_PROGRESS: ProgressSnapshot = Object.freeze({
  totalXp: 0,
  totalCompleted: 0,
  currentStreak: 0,
  longestStreak: 0,
  updatedAt: null,
});

function resolvedColorScheme(value: ReturnType<typeof useColorScheme>): ColorScheme {
  return value === 'dark' ? 'dark' : 'light';
}

export function ProgressRouteScreen() {
  const language = useAppLanguage();
  const colorScheme = resolvedColorScheme(useColorScheme());
  const numberLocale = getLocales()[0].languageTag;
  const [snapshot, setSnapshot] = useState<ProgressSnapshot>(EMPTY_PROGRESS);
  const [recent, setRecent] = useState<readonly ProgressRecentItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        const auth = await rootAuthController.restore();
        if (auth.status !== 'signed_in') return;
        const database = await openMobileDatabase();
        const repositories = createLocalRepositories(database, auth.session.accountId);
        const [nextSnapshot, summaries] = await Promise.all([
          repositories.progress.getSnapshot(),
          repositories.progress.listRecent(RECENT_COMPLETION_LIMIT),
        ]);
        if (!active) return;
        setSnapshot(nextSnapshot);
        setRecent(
          summaries.map((summary) => ({
            occurrenceId: summary.occurrenceId,
            title: summary.title,
            completedAt: summary.completedAt,
            awardedXp: summary.awardedXp,
          })),
        );
      };

      void load().then(() =>
        rootSyncRuntime
          .run()
          .then(() => load())
          .catch(() => undefined),
      );

      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <ProgressScreen
      colorScheme={colorScheme}
      language={language}
      numberLocale={numberLocale}
      snapshot={snapshot}
      recent={recent}
    />
  );
}
