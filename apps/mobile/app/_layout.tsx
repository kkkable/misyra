/**
 * Root layout for the Misyra mobile shell (MTS-003).
 *
 * Composes the permanent tab navigator only; full-screen flows and modal
 * sheets arrive with later tickets (technical specification section 8).
 */
import { Stack } from "expo-router";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
