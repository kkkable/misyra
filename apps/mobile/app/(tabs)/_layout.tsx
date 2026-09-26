import { layout } from '@misyra/design-tokens';
import {
  aiPlannerCatalogs,
  localizationCatalogs,
  notificationSettingsCatalogs,
  progressLocalizationCatalogs,
} from '@misyra/localization';
import { Tabs } from 'expo-router';

import { useAppLanguage } from '../../src/localization/use-app-language.js';

export default function TabLayout() {
  const language = useAppLanguage();

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { minHeight: layout.minimumTouchTarget },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: localizationCatalogs[language]['calendar.shell.title'] }}
      />
      <Tabs.Screen name="ai-planner" options={{ title: aiPlannerCatalogs[language].title }} />
      <Tabs.Screen name="progress" options={{ title: progressLocalizationCatalogs[language].title }} />
      <Tabs.Screen
        name="settings"
        options={{ title: notificationSettingsCatalogs[language].title }}
      />
    </Tabs>
  );
}
