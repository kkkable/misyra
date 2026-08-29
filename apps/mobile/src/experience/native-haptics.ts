import * as ExpoHaptics from 'expo-haptics';
import { Platform } from 'react-native';

import { createHapticAdapter } from './haptics.js';
import type { HapticDriver, HapticImpactStyle, HapticNotificationType } from './haptics.js';

const impactStyles: Record<HapticImpactStyle, ExpoHaptics.ImpactFeedbackStyle> = {
  light: ExpoHaptics.ImpactFeedbackStyle.Light,
};

const notificationTypes: Record<HapticNotificationType, ExpoHaptics.NotificationFeedbackType> = {
  error: ExpoHaptics.NotificationFeedbackType.Error,
  warning: ExpoHaptics.NotificationFeedbackType.Warning,
};

export const expoHapticDriver: HapticDriver = {
  isAvailable: () => Platform.OS === 'ios' || Platform.OS === 'android',
  selection: () => ExpoHaptics.selectionAsync(),
  impact: (style) => ExpoHaptics.impactAsync(impactStyles[style]),
  notification: (type) => ExpoHaptics.notificationAsync(notificationTypes[type]),
};

export const haptics = createHapticAdapter(expoHapticDriver);
