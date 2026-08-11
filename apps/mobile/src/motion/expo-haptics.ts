/**
 * MTS-011 — real Expo haptics binding.
 *
 * Thin adapter over the approved `expo-haptics` boundary (technical
 * specification §5/§7.5). It maps each semantic intent to a subtle expo-haptics
 * call and never throws: if the platform cannot provide haptics, the
 * underlying call rejects and is silently swallowed (deterministic no-op).
 *
 * This module is the only motion-foundation file that touches the Expo
 * haptics provider; the framework-free cores (`motion.ts`, `haptics.ts`) stay
 * importable and testable in plain Node.
 *
 * No interface-sound API is used or introduced (product specification §24).
 */
import * as ExpoHaptics from "expo-haptics";
import { type HapticsAdapter, type HapticIntent } from "./haptics";

/** Subtle mapping from semantic intent to the approved Expo haptics call. */
function triggerFor(intent: HapticIntent): Promise<void> {
  switch (intent) {
    case "selection":
      return ExpoHaptics.selectionAsync();
    case "snap":
    case "save":
      return ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light);
    case "completion":
    case "destructive":
      return ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium);
    case "story-save":
      return ExpoHaptics.selectionAsync();
    case "validation-failure":
      return ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error);
  }
}

/** Real adapter bound to the Expo haptics boundary; never throws. */
export const expoHapticsAdapter: HapticsAdapter = {
  supported: true,
  trigger(intent: HapticIntent): void {
    void triggerFor(intent).catch(() => {
      /* haptics unavailable/ignored by the system: silent no-op */
    });
  },
};
