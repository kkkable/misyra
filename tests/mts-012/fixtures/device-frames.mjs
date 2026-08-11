/**
 * MTS-012 deterministic visual/device fixtures — data only, no logic.
 *
 * The approved phone-size matrix, appearance modes, locales, and text scales
 * come from technical specification §6.2 (responsive phone frames) and the
 * MTS-012 ticket (screenshot fixtures for approved screens, widths,
 * languages, themes, and text sizes). Every value here is a fixed,
 * deterministic constant so automated runs need no device, simulator,
 * service, account, or credential.
 *
 * Design notes (documented assumptions of the harness model):
 * - Safe-area insets are canonical per platform (iOS dynamic-island phone,
 *   Android gesture phone), not per-handset-exact. Determinism is the
 *   contract; the values are the approved-model inputs.
 * - The shell's tab bar is the built-in bottom tab bar: standard 49 pt bar,
 *   10 pt labels, 24 pt icons, bottom inset applied by the bar itself.
 * - Text measurement uses a deterministic advance-width model
 *   (FONT_ADVANCE + LINE_HEIGHT_FACTOR), not a real font engine.
 */
export const REFERENCE_FRAME = "393x852";

/** Approved portrait phone frames (§6.2) with canonical per-platform insets. */
export const DEVICE_FRAMES = {
  "360x800": {
    id: "360x800",
    width: 360,
    height: 800,
    insets: {
      ios: { top: 59, bottom: 34, left: 0, right: 0 },
      android: { top: 24, bottom: 24, left: 0, right: 0 },
    },
  },
  "390x844": {
    id: "390x844",
    width: 390,
    height: 844,
    insets: {
      ios: { top: 59, bottom: 34, left: 0, right: 0 },
      android: { top: 24, bottom: 24, left: 0, right: 0 },
    },
  },
  "393x852": {
    id: "393x852",
    width: 393,
    height: 852,
    insets: {
      ios: { top: 59, bottom: 34, left: 0, right: 0 },
      android: { top: 24, bottom: 24, left: 0, right: 0 },
    },
  },
  "412x915": {
    id: "412x915",
    width: 412,
    height: 915,
    insets: {
      ios: { top: 59, bottom: 34, left: 0, right: 0 },
      android: { top: 24, bottom: 24, left: 0, right: 0 },
    },
  },
};

/** Platforms rendered by the harness (compared within platform, never across). */
/** @type {("ios" | "android")[]} */
export const PLATFORMS = ["ios", "android"];

/** Appearance modes the fixtures must represent. */
/** @type {("light" | "dark")[]} */
export const APPEARANCES = ["light", "dark"];

/** Locales whose text/layout can materially change (English + zh-HK). */
export const LOCALES = ["en", "zh-HK"];

/** Text scales: 1.0 normal, 2.0 large text (MTS-012 "large text is included"). */
export const TEXT_SCALES = [1, 2];

/** Built-in bottom tab bar model constants (standard values, deterministic). */
export const TAB_BAR = {
  baseHeight: 49,
  labelFontSize: 10,
  iconSize: 24,
};

/**
 * Deterministic advance-width model: average advance per character class,
 * expressed as a fraction of the scaled font size. Latin/alphanumeric glyphs
 * average 0.5 em, CJK glyphs and CJK punctuation are full-width 1.0 em,
 * spaces 0.25 em, ASCII punctuation 0.5 em.
 */
export const FONT_ADVANCE = {
  cjk: 1.0,
  cjkPunct: 1.0,
  latin: 0.5,
  digit: 0.5,
  asciiPunct: 0.5,
  space: 0.25,
};

/** Deterministic line height = scaledFontSize * LINE_HEIGHT_FACTOR. */
export const LINE_HEIGHT_FACTOR = 1.4;
