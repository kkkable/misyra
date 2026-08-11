/**
 * MTS-011 — public motion/haptic boundary.
 *
 * Feature code consumes the shared motion helpers, Reduce Motion mapping,
 * semantic haptics facade, and the real Expo haptics adapter through this
 * single entry — never by deep-importing internals or by touching
 * `expo-haptics` directly. The surface is explicit: only the approved names
 * are re-exported.
 */
export {
  timingDuration,
  easingCurve,
  releaseSpring,
  resolveMotionAction,
  fadeSpec,
  type TimingStyle,
  type EasingStyle,
  type SpringSpec,
  type MotionPreference,
  type MotionClass,
  type ReducedAction,
  type FadeSpec,
} from "./motion";
export {
  Haptics,
  FakeHapticsAdapter,
  noopHapticsAdapter,
  createHaptics,
  type HapticIntent,
  type HapticsAdapter,
} from "./haptics";
export { expoHapticsAdapter } from "./expo-haptics";
