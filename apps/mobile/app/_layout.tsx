import { Stack } from 'expo-router';

import { AuthGate } from '../src/auth/auth-gate.js';
import { rootAuthController, rootAuthMessages } from '../src/auth/auth-runtime.js';
import { OnboardingGate } from '../src/onboarding/onboarding-gate.js';
import {
  rootOnboardingController,
  rootOnboardingMessages,
} from '../src/onboarding/onboarding-runtime.js';
import { SyncRuntimeGate } from '../src/sync/sync-runtime-gate.js';

export const unstable_settings = {
  anchor: '(tabs)',
} as const;

export default function RootLayout() {
  return (
    <AuthGate controller={rootAuthController} messages={rootAuthMessages}>
      <SyncRuntimeGate>
        <OnboardingGate controller={rootOnboardingController} messages={rootOnboardingMessages}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
  );
}
