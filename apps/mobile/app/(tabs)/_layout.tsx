/**
 * Permanent bottom navigation for the Misyra mobile shell (MTS-010).
 *
 * Technical specification section 8 fixes this inventory to exactly
 * Calendar, AI Planner, Progress, and Settings, with Calendar as the
 * default root. Labels come from the localization boundary. The built-in
 * bottom tab bar renders inside the root SafeAreaProvider and applies the
 * resolved bottom gesture inset itself, so the shell stays clear of system
 * gesture areas without re-applying the inset manually.
 */
import { Tabs } from "expo-router";
import { translate } from "@misyra/localization";
import { deviceCatalog } from "../../src/localization/device-catalog";

export default function TabsLayout() {
  const catalog = deviceCatalog();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: translate(catalog, "tabs.calendar") }} />
      <Tabs.Screen name="ai-planner" options={{ title: translate(catalog, "tabs.aiPlanner") }} />
      <Tabs.Screen name="progress" options={{ title: translate(catalog, "tabs.progress") }} />
      <Tabs.Screen name="settings" options={{ title: translate(catalog, "tabs.settings") }} />
    </Tabs>
  );
}
