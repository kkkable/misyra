/**
 * Typed, framework-free visual design tokens for Misyra (MTS-008).
 *
 * The single source of truth for reusable visual constants is the approved
 * Technical Specification, section 6 ("Visual Design System") and section
 * 7.2 ("Timing tokens"):
 *   - §6.3 space scale,
 *   - §6.4 radius scale,
 *   - §6.5 semantic typography (platform system-font intent; no bundled font),
 *   - §6.6 light palette,
 *   - §6.7 dark palette,
 *   - §6.8 elevation (restrained shadows),
 *   - §7.2 duration / easing / spring motion tokens.
 *
 * This package is pure TypeScript and platform/framework neutral. It declares
 * no React Native, Expo, React, provider, database, Azure, or feature-layer
 * dependency or import. The only runtime code is the documented WCAG 2.x
 * contrast helper; everything else is data and types.
 *
 * Motion/haptic *behavior* (animation helpers, Reanimated integration,
 * Reduce Motion service, haptic adapter) is intentionally out of scope
 * (MTS-011); the centralized motion tokens themselves are part of MTS-008.
 */

/** Approx. 4-point base-grid spacing scale (§6.3). */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

/** Corner radius scale (§6.4). */
export const radius = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/** Approved typographic weight values (§6.5). */
export type TypographyWeight = 400 | 500 | 600 | 700;

/**
 * One semantic typography token (§6.5).
 *
 * `weight` is the approved weight set for that token. A single-weight token
 * (e.g. `caption2` at 500) lists one value; a dual-weight token (e.g. `body`
 * at 400/500) lists both approved values. Consumers select from the approved
 * set and map `size` onto the platform system stack — this package bundles no
 * custom font and remains compatible with system text scaling.
 */
export interface TypographyToken {
  /** Point size. */
  readonly size: number;
  /** Approved weight(s). */
  readonly weight: readonly TypographyWeight[];
}

/**
 * Semantic typography scale using platform system-font intent only (§6.5).
 * No custom font is bundled.
 */
export const typography = {
  caption2: { size: 11, weight: [500] },
  caption1: { size: 12, weight: [500] },
  bodySmall: { size: 14, weight: [400, 500] },
  body: { size: 16, weight: [400, 500] },
  headline: { size: 18, weight: [600] },
  title3: { size: 22, weight: [700] },
  title2: { size: 28, weight: [700] },
  title1: { size: 34, weight: [700] },
} as const satisfies Record<string, TypographyToken>;

/** Light-mode semantic color palette (§6.6). */
export const lightColors = {
  canvas: "#F8F8FC",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#F3F2F8",
  textPrimary: "#15152D",
  textSecondary: "#667085",
  textTertiary: "#98A2B3",
  border: "#E7E5EF",
  divider: "#EEEAF4",

  primary: "#6D3CF3",
  primaryPressed: "#5728D5",
  primarySoft: "#F0EAFF",
  primaryText: "#FFFFFF",

  verified: "#22A95B",
  verifiedSoft: "#EAF8EF",
  late: "#E89A12",
  lateSoft: "#FFF4D8",
  privateState: "#8A93A3",
  privateSoft: "#F0F2F5",
  destructive: "#E5484D",
  destructiveSoft: "#FDECEC",
  external: "#4A7FE7",
  externalSoft: "#EAF1FF",

  overlay: "rgba(18, 18, 32, 0.38)",
  focusRing: "#8A63FF",
} as const;

/** Dark-mode semantic color palette (§6.7). */
export const darkColors = {
  canvas: "#11111A",
  surface: "#191925",
  surfaceRaised: "#222231",
  surfaceMuted: "#242434",
  textPrimary: "#F7F5FF",
  textSecondary: "#B9B5C8",
  textTertiary: "#8E899F",
  border: "#343247",
  divider: "#2A2939",

  primary: "#6D3DFF",
  primaryPressed: "#724AF2",
  primarySoft: "#2A214A",
  primaryText: "#FFFFFF",

  verified: "#54CF83",
  verifiedSoft: "#173325",
  late: "#FFC04D",
  lateSoft: "#3C2E13",
  privateState: "#A9B0BD",
  privateSoft: "#292D35",
  destructive: "#FF6B70",
  destructiveSoft: "#3D1F24",
  external: "#79A3FF",
  externalSoft: "#1E2D4D",

  overlay: "rgba(0, 0, 0, 0.62)",
  focusRing: "#B29CFF",
} as const;

/** Union of the approved semantic color keys shared by both palettes. */
export type SemanticColorKey = keyof typeof lightColors;

/**
 * A semantic color value from the approved palettes — the union of the
 * light (§6.6) and dark (§6.7) palette value types, so consumers may use
 * any approved literal from either mode. The contract stays a literal
 * union: arbitrary non-token colors are still rejected.
 */
export type ColorValue =
  (typeof lightColors)[SemanticColorKey] | (typeof darkColors)[SemanticColorKey];

/**
 * Typed light/dark theme pair exposing the same semantic color keys, so
 * consumers do not need theme-specific branching by raw key name.
 */
export interface DesignTokensTheme {
  readonly light: typeof lightColors;
  readonly dark: typeof darkColors;
}

/** The concrete approved light/dark theme pair. */
export const themes: DesignTokensTheme = {
  light: lightColors,
  dark: darkColors,
};

/** Compile-time equality witness. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

/**
 * Compile-time proof that the light and dark palettes expose exactly the same
 * semantic color keys. If a key is added to one palette but not the other,
 * this declaration fails to compile (the literal type collapses to `false`).
 */
export const lightDarkSemanticKeyParity: Equal<keyof typeof lightColors, keyof typeof darkColors> =
  true;

/**
 * Timing durations in milliseconds (technical specification §7.2).
 *
 * Centralized so screens and services never invent their own durations;
 * `celebrationMin`/`celebrationMax` are the approved mission-completion
 * celebration bounds.
 */
export const duration = {
  instant: 80,
  fast: 140,
  standard: 220,
  sheet: 280,
  emphasis: 420,
  celebrationMin: 600,
  celebrationMax: 900,
} as const;

/** Cubic-bezier easing curves (technical specification §7.2). */
export const easing = {
  standard: [0.2, 0.0, 0.0, 1.0],
  enter: [0.0, 0.0, 0.2, 1.0],
  exit: [0.4, 0.0, 1.0, 1.0],
} as const;

/** Spring configuration for release after drag/resize (technical specification §7.2). */
export const spring = {
  damping: 22,
  stiffness: 260,
  mass: 0.8,
} as const;

/**
 * Elevation (technical specification §6.8): restrained shadows only.
 *
 * Three semantic levels, each with platform-specific representations so
 * screens never invent their own shadow constants:
 *   - `card`     — subtle 1–2 pt vertical offset, low opacity;
 *   - `sheet`    — stronger top separation (bottom sheets slide up from the
 *                  bottom, so their separation shadow is cast upward);
 *   - `floating` — medium elevation for the floating capture / primary
 *                  action.
 *
 * iOS values are shadow properties; Android uses material elevation. The
 * numeric representations intentionally differ per platform (§6.8: visually
 * equivalent, not numerically identical) but stay centralized.
 */
export const elevation = {
  card: {
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
    },
    android: { elevation: 2 },
  },
  sheet: {
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
    },
    android: { elevation: 12 },
  },
  floating: {
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
    },
    android: { elevation: 16 },
  },
} as const;

/**
 * WCAG 2.x relative luminance of an sRGB hex color.
 *
 * Follows the WCAG 2.1 §1.4.3 formula:
 *   - each 8-bit channel is normalized to [0, 1];
 *   - linearize: c / 12.92 when c <= 0.03928, otherwise ((c + 0.055) / 1.055) ^ 2.4;
 *   - L = 0.2126R + 0.7152G + 0.0722B.
 *
 * Accepts "#RGB" and "#RRGGBB" forms; anything else throws.
 */
export function wcagRelativeLuminance(hex: string): number {
  const normalized = hex.replace(/^#/, "");
  const expanded =
    normalized.length === 3 ? [...normalized].map((c) => c + c).join("") : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`wcagRelativeLuminance: expected "#RGB" or "#RRGGBB", got "${hex}"`);
  }
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(expanded.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.x contrast ratio between two hex colors:
 * (L1 + 0.05) / (L2 + 0.05), where L1 >= L2 (WCAG 2.1 §1.4.3).
 *
 * Ordinary text requires 4.5:1 (AA); UI components and large text require
 * 3:1. Centralized here so screens and primitives never implement a second,
 * divergent contrast calculation.
 */
export function wcagContrastRatio(fg: string, bg: string): number {
  const l1 = wcagRelativeLuminance(fg);
  const l2 = wcagRelativeLuminance(bg);
  return l1 >= l2 ? (l1 + 0.05) / (l2 + 0.05) : (l2 + 0.05) / (l1 + 0.05);
}
