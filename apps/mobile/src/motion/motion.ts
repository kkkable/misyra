/**
 * MTS-011 — centralized motion helpers and Reduce Motion mapping.
 *
 * Framework-free core. It consumes the centralized MTS-008 timing tokens
 * (`duration`, `easing`, `spring`) from `@misyra/design-tokens` and exposes a
 * narrow reusable API so callers never invent raw timing/easing constants.
 * It imports no React Native / Expo / Reanimated module, so every helper is
 * deterministically unit-testable with `node --test`.
 *
 * Reduce Motion (technical specification §7.4, product specification §24):
 * nonessential directional/decorative motion (parallax, confetti, moving
 * outlines, elaborate transitions, celebration motion) degrades to a fade or
 * static/immediate form, while essential loading indicators and direct drag
 * manipulation are preserved.
 */
import { duration, easing, spring } from "@misyra/design-tokens";

/** Approved duration style keys (technical specification §7.2). */
export type TimingStyle = "instant" | "fast" | "standard" | "sheet" | "emphasis";

/** Approved easing style keys (technical specification §7.2). */
export type EasingStyle = "standard" | "enter" | "exit";

/** Resolves an approved duration style to its centralized token value (ms). */
export function timingDuration(style: TimingStyle): number {
  return duration[style];
}

/** Resolves an approved easing style to its centralized cubic-bezier token. */
export function easingCurve(style: EasingStyle): readonly number[] {
  return easing[style];
}

/** The approved release-after-drag/resize spring (technical specification §7.2). */
export interface SpringSpec {
  readonly damping: number;
  readonly stiffness: number;
  readonly mass: number;
}

/** Returns the centralized release spring configuration. */
export function releaseSpring(): SpringSpec {
  return { damping: spring.damping, stiffness: spring.stiffness, mass: spring.mass };
}

/** System motion preference (technical specification §7.4). */
export type MotionPreference = "reduce" | "no-preference";

/**
 * Behavior classes the motion layer can classify.
 * "essential-loading" and "direct-manipulation" are preserved under Reduce
 * Motion; everything else is nonessential and degrades to a reduced form.
 */
export type MotionClass =
  | "essential-loading"
  | "direct-manipulation"
  | "directional"
  | "decorative"
  | "confetti"
  | "parallax"
  | "moving-outline"
  | "celebration";

/**
 * The motion to apply for a class under a given preference:
 *  - "keep"      — unchanged (essential behavior preserved);
 *  - "fade"      — replace directional movement with a (short) fade;
 *  - "immediate" — replace motion with an immediate/instant update;
 *  - "static"    — remove the motion entirely (static confirmation/update).
 */
export type ReducedAction = "keep" | "fade" | "immediate" | "static";

/**
 * Maps a motion class to the action to perform for a motion preference.
 * Under "no-preference" every class is kept. Under "reduce", nonessential
 * directional motion fades and decorative motion is removed to static, while
 * essential loading and direct drag manipulation stay.
 */
export function resolveMotionAction(pref: MotionPreference, cls: MotionClass): ReducedAction {
  if (pref === "no-preference") {
    return "keep";
  }
  switch (cls) {
    case "essential-loading":
    case "direct-manipulation":
      return "keep";
    case "directional":
      return "fade";
    case "decorative":
    case "confetti":
    case "parallax":
    case "moving-outline":
    case "celebration":
      return "static";
  }
}

/** A fade configuration resolved from centralized timing tokens. */
export interface FadeSpec {
  readonly durationMs: number;
  readonly easing: readonly number[];
}

/**
 * A fade configuration for a motion preference and duration style. Under
 * Reduce Motion the fade uses the instant duration token (an immediate /
 * fast fade) instead of the normal style duration, per the approved behavior
 * of replacing directional motion with a fade or immediate update.
 */
export function fadeSpec(pref: MotionPreference, style: TimingStyle = "standard"): FadeSpec {
  return {
    durationMs: pref === "reduce" ? duration.instant : duration[style],
    easing: easing.standard,
  };
}
