import { useEffect, useState } from 'react';
import { getLocales } from 'expo-localization';
import { useRouter } from 'expo-router';
import { StyleSheet, View, useColorScheme } from 'react-native';

import type { ColorScheme } from '../design-system/contracts.js';
import { useAppLanguage } from '../localization/use-app-language.js';
import { completionSettlementChannel } from '../sync/completion-settlement-runtime.js';
import { rootSyncRuntime } from '../sync/root-sync-runtime.js';
import {
  completionConfirmationChannel,
  completionConfirmationRequestChannel,
  type ForegroundCompletionConfirmationEvent,
  type ForegroundCompletionRequest,
} from './completion-confirmation-runtime.js';
import { settleForegroundCompletionRequest } from './completion-confirmation-settlement.js';
import { CompletionConfirmation } from './completion-confirmation-view.js';
import { CalendarRouteScreen } from './calendar-route-screen.js';

async function settleForegroundCompletion(request: ForegroundCompletionRequest): Promise<void> {
  await settleForegroundCompletionRequest({
    request,
    runSync: () => rootSyncRuntime.run(),
    subscribeSettlement: (listener) => completionSettlementChannel.subscribe(listener),
    publishConfirmation: (event) => completionConfirmationChannel.publish(event),
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
