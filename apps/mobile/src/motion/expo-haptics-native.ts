/**
 * MTS-011 — native wiring for the real Expo haptics adapter.
 *
 * The only motion-foundation file that imports the runtime `expo-haptics`
 * and `react-native` modules (Metro-only; not importable under plain Node).
 * It binds the platform-aware factory to `Platform.OS` and the real provider.
 * The enum casts are confined to this file: the factory speaks the documented
 * string values of the SDK 57 enums, which are identical at runtime.
 *
 * No interface-sound API is used or introduced (product specification §24),
 * and no raw vibration patterns or legacy Android vibration-simulation API
 * calls exist (technical specification §7.5).
 */
import { Platform } from "react-native";
import * as ExpoHaptics from "expo-haptics";
import { createExpoHapticsAdapter, type ExpoHapticsProvider } from "./expo-haptics";

/** Real expo-haptics provider adapted to the injectable adapter boundary. */
const provider: ExpoHapticsProvider = {
  selectionAsync: () => ExpoHaptics.selectionAsync(),
  impactAsync: (style) => ExpoHaptics.impactAsync(style as ExpoHaptics.ImpactFeedbackStyle),
  notificationAsync: (type) =>
    ExpoHaptics.notificationAsync(type as ExpoHaptics.NotificationFeedbackType),
  performAndroidHapticsAsync: (type) =>
    ExpoHaptics.performAndroidHapticsAsync(type as ExpoHaptics.AndroidHaptics),
};

/**
 * Real adapter bound to the device haptics engine and the current platform.
 * `supported` is a platform-capability claim only (Android/iOS); system
 * haptic settings are honored by the platform and suppressed executions are
 * silent no-ops.
 */
export const expoHapticsAdapter = createExpoHapticsAdapter(Platform.OS, provider);
