import { useEffect, useState } from 'react';
import { getLocales } from 'expo-localization';
import { useRouter } from 'expo-router';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { rootAuthController } from '../auth/auth-runtime.js';
import type { ColorScheme } from '../design-system/contracts.js';
import { useAppLanguage } from '../localization/use-app-language.js';
import { openMobileDatabase } from '../storage/database.js';
import { createLocalRepositories } from '../storage/local-repositories.js';
import { rootSyncRuntime } from '../sync/root-sync-runtime.js';
import {
  completionConfirmationChannel,
  completionConfirmationRequestChannel,
  type ForegroundCompletionConfirmationEvent,
  type ForegroundCompletionRequest,
} from './completion-confirmation-runtime.js';
import { CompletionConfirmation } from './completion-confirmation-view.js';
import { CalendarRouteScreen } from './calendar-route-screen.js';

type CompletionRow = Readonly<{ awarded_xp: number }>;

async function settleForegroundCompletion(request: ForegroundCompletionRequest): Promise<void> {
  await rootSyncRuntime.run();
  const authState = await rootAuthController.restore();
  if (authState.status !== 'signed_in') return;

  const database = await openMobileDatabase();
  const repositories = createLocalRepositories(database, authState.session.accountId);
  const [completion, progress] = await Promise.all([
    database.getFirstAsync<CompletionRow>(
      `SELECT awarded_xp
         FROM completion_summaries
        WHERE account_id = ? AND occurrence_id = ?`,
      authState.session.accountId,
      request.occurrenceId,
    ),
    repositories.progress.getSnapshot(),
  ]);
  if (completion === null) return;

  completionConfirmationChannel.publish({
    occurrenceId: request.occurrenceId,
    awardedXp: completion.awarded_xp,
    totalXp: progress.totalXp,
  });
}

export function CalendarRouteWithCompletion() {
  const router = useRouter();
  const language = useAppLanguage();
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const numberLocale = getLocales()[0].languageTag;
  const [confirmation, setConfirmation] = useState<ForegroundCompletionConfirmationEvent | null>(
    null,
  );

  useEffect(() => {
    const unsubscribeConfirmation = completionConfirmationChannel.subscribe(setConfirmation);
    const unsubscribeRequest = completionConfirmationRequestChannel.subscribe((request) => {
      void settleForegroundCompletion(request).catch(() => undefined);
    });
    return () => {
      unsubscribeRequest();
      unsubscribeConfirmation();
    };
  }, []);

  return (
    <View style={styles.container}>
      <CalendarRouteScreen />
      {confirmation === null ? null : (
        <CompletionConfirmation
          colorScheme={colorScheme}
          event={confirmation}
          language={language}
          numberLocale={numberLocale}
          onCreateStory={() => {
            const occurrenceId = confirmation.occurrenceId;
            setConfirmation(null);
            router.push({ pathname: '/story', params: { occurrenceId } });
          }}
          onDone={() => {
            setConfirmation(null);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
