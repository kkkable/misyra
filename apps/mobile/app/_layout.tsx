import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthGate } from '../src/auth/auth-gate.js';
import { rootAuthController, rootAuthMessages } from '../src/auth/auth-runtime.js';
import { SystemMotionPreferenceProvider } from '../src/experience/system-reduce-motion.js';
import { createExpoNotificationPermissionService } from '../src/notifications/expo-notification-permission.js';
import { MissionNotificationResponseBridge } from '../src/notifications/mission-notification-response-bridge.js';
import { OnboardingGate } from '../src/onboarding/onboarding-gate.js';
import {
  configureOnboardingNotificationPermissionRequest,
  rootOnboardingController,
  rootOnboardingMessages,
  rootOnboardingNotificationChannelName,
} from '../src/onboarding/onboarding-runtime.js';
import { SyncRuntimeGate } from '../src/sync/sync-runtime-gate.js';

const rootOnboardingNotificationPermissionService = createExpoNotificationPermissionService({
  androidChannelName: rootOnboardingNotificationChannelName,
});

configureOnboardingNotificationPermissionRequest(async () => {
  const permission = await rootOnboardingNotificationPermissionService.request();
  if (permission.status === 'enabled') return 'granted';
  if (permission.status === 'denied') return 'denied';
  return 'unavailable';
});

export const unstable_settings = {
  anchor: '(tabs)',
} as const;

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SystemMotionPreferenceProvider>
        <AuthGate controller={rootAuthController} messages={rootAuthMessages}>
          <SyncRuntimeGate>
            <OnboardingGate controller={rootOnboardingController} messages={rootOnboardingMessages}>
              <MissionNotificationResponseBridge />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="mission/[id]"
                  options={{
                    gestureEnabled: true,
                    headerShown: false,
                  }}
                />
                <Stack.Screen
                  name="evidence"
                  options={{
                    gestureEnabled: true,
                    headerShown: false,
                    presentation: 'fullScreenModal',
                  }}
                />
                <Stack.Screen
                  name="story"
                  options={{
                    gestureEnabled: true,
                    headerShown: false,
                    presentation: 'fullScreenModal',
                  }}
                />
              </Stack>
            </OnboardingGate>
          </SyncRuntimeGate>
        </AuthGate>
      </SystemMotionPreferenceProvider>
    </GestureHandlerRootView>
  );
}
