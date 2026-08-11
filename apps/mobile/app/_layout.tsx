/**
 * Root layout for the Misyra mobile shell (MTS-010).
 *
 * Composes the permanent tab navigator inside a safe-area provider so every
 * inset consumer in the shell (tab bar, screens) resolves real system safe
 * areas and gesture insets. Evidence and Story are full-screen modal route
 * boundaries above the tab navigator; their feature implementation belongs
 * to later tickets (technical specification section 8).
 */
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="evidence" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="story" options={{ presentation: "fullScreenModal" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
