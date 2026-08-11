/**
 * MTS-011 — real Expo haptics adapter (platform-aware).
 *
 * Platform-aware boundary over the approved `expo-haptics` SDK 57 API
 * (technical specification §7.5). On Android it routes every semantic intent
 * through the action-oriented system-haptic path
 * `ExpoHaptics.performAndroidHapticsAsync(...)` with `AndroidHaptics` semantic
 * constants — the path designed to honor the user's system touch-feedback
 * setting — instead of the Android-simulated `impactAsync`/`notificationAsync`
 * path (which is backed by the legacy Android vibration simulation). On iOS it
 * retains the subtle Expo selection/impact/notification APIs, which honor the
 * system Taptic Engine settings.
 *
 * This module imports only types from `expo-haptics`, so the complete adapter
 * logic is deterministic and importable under plain Node tests through
 * `createExpoHapticsAdapter(platform, provider)`. The thin native wiring
 * module (`expo-haptics-native.ts`) is the only file that binds the real
 * provider and `Platform.OS`.
 *
 * Availability (`supported`) is a synchronous platform-capability claim
 * (true only on Android/iOS), never a claim that the system will currently
 * produce haptics: system settings are applied by the platform, and an
 * execution the system suppresses rejects and is silently swallowed.
 *
 * No interface-sound API is used or introduced (product specification §24),
 * and no raw vibration patterns or legacy Android vibration-simulation API
 * calls exist (technical specification §7.5: "Respect system haptic settings").
 */
import { type HapticsAdapter, type HapticIntent } from "./haptics";

/** Subtle impact styles used on iOS (expo-haptics `ImpactFeedbackStyle` values). */
export type ImpactStyle = "light" | "medium";

/** Notification feedback used on iOS (expo-haptics `NotificationFeedbackType` value). */
export type NotificationType = "error";

/**
 * Android system-haptic constants used on Android
 * (expo-haptics `AndroidHaptics` values, SDK 57).
 */
export type AndroidHapticConstant = "segment-tick" | "segment-frequent-tick" | "confirm" | "reject";

/**
 * Injectable surface of the `expo-haptics` module the adapter needs. The
 * native wiring adapts the real module to this boundary; the enum casts are
 * confined to that file because the string values are identical at runtime.
 */
export interface ExpoHapticsProvider {
  selectionAsync(): Promise<void>;
  impactAsync(style: ImpactStyle): Promise<void>;
  notificationAsync(type: NotificationType): Promise<void>;
  performAndroidHapticsAsync(type: AndroidHapticConstant): Promise<void>;
}

/** Android action-oriented system haptic for each semantic intent (§7.5). */
function androidConstantFor(intent: HapticIntent): AndroidHapticConstant {
  switch (intent) {
    case "selection":
      return "segment-tick"; // switching between discrete choices (e.g. time slots)
    case "snap":
      return "segment-frequent-tick"; // very soft drag/resize detent tick
    case "save":
    case "completion":
    case "story-save":
      return "confirm"; // confirmation / successful completion of an interaction
    case "destructive":
    case "validation-failure":
      return "reject"; // rejection / failure of an interaction
  }
}

/** iOS subtle Expo feedback for each semantic intent (§7.5). */
function iosCallFor(provider: ExpoHapticsProvider, intent: HapticIntent): Promise<void> {
  switch (intent) {
    case "selection":
    case "story-save":
      return provider.selectionAsync();
    case "snap":
    case "save":
      return provider.impactAsync("light");
    case "completion":
    case "destructive":
      return provider.impactAsync("medium");
    case "validation-failure":
      return provider.notificationAsync("error");
  }
}

/**
 * Construct the real adapter for a platform string and provider.
 *
 * `supported` is a truthful synchronous platform-capability claim (Android
 * and iOS only), never proof that the system will currently produce haptics;
 * executions the system suppresses or that fail are silent no-ops. Triggering
 * is fire-and-forget: haptics never block, throw, or crash the caller.
 */
export function createExpoHapticsAdapter(
  platform: string,
  provider: ExpoHapticsProvider,
): HapticsAdapter {
  const android = platform === "android";
  const supported = android || platform === "ios";
  return {
    supported,
    trigger(intent: HapticIntent): void {
      if (!supported) {
        return; // unsupported platform: deterministic no-op
      }
      const call = android
        ? provider.performAndroidHapticsAsync(androidConstantFor(intent))
        : iosCallFor(provider, intent);
      void call.catch(() => {
        /* haptics unavailable/ignored by the system: silent no-op */
      });
    },
  };
}
