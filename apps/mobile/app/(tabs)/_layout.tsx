/**
 * Permanent bottom navigation for the Misyra mobile shell (MTS-010).
 *
 * Technical specification section 8 fixes this inventory to exactly
 * Calendar, AI Planner, Progress, and Settings, with Calendar as the
 * default root. Labels come from the localization boundary. The tab bar
 * explicitly applies the resolved bottom gesture inset so the shell stays
 * clear of system gesture areas on every device.
 */
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { translate } from "@misyra/localization";
import { deviceCatalog } from "../../src/localization/device-catalog";

export default function TabsLayout() {
  const catalog = deviceCatalog();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { paddingBottom: insets.bottom },
      }}
    >
      <Tabs.Screen name="index" options={{ title: translate(catalog, "tabs.calendar") }} />
      <Tabs.Screen name="ai-planner" options={{ title: translate(catalog, "tabs.aiPlanner") }} />
      <Tabs.Screen name="progress" options={{ title: translate(catalog, "tabs.progress") }} />
      <Tabs.Screen name="settings" options={{ title: translate(catalog, "tabs.settings") }} />
    </Tabs>
  );
}
