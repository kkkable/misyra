import { layout } from '@misyra/design-tokens';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { minHeight: layout.minimumTouchTarget },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="ai-planner" options={{ title: 'AI Planner' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
