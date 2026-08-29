import { Stack } from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
} as const;

export default function RootLayout() {
  return (
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
  );
}
