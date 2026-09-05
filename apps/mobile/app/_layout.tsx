import { Stack } from 'expo-router';

import { AuthGate } from '../src/auth/auth-gate.js';
import { rootAuthController, rootAuthMessages } from '../src/auth/auth-runtime.js';

export const unstable_settings = {
  anchor: '(tabs)',
} as const;

export default function RootLayout() {
  return (
    <AuthGate controller={rootAuthController} messages={rootAuthMessages}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="evidence"
          options={{ gestureEnabled: true, headerShown: false, presentation: 'fullScreenModal' }}
        />
        <Stack.Screen
          name="story"
          options={{ gestureEnabled: true, headerShown: false, presentation: 'fullScreenModal' }}
        />
      </Stack>
    </AuthGate>
  );
}
