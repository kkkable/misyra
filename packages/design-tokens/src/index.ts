/**
 * Typed, framework-free visual design tokens for Misyra (MTS-008).
 *
 * The single source of truth for reusable visual constants is the approved
 * Technical Specification, section 6 ("Visual Design System"):
 *   - §6.3 space scale,
 *   - §6.4 radius scale,
 *   - §6.5 semantic typography (platform system-font intent; no bundled font),
 *   - §6.6 light palette,
 *   - §6.7 dark palette.
 *
 * This package is pure TypeScript and platform/framework neutral. It declares
 * no React Native, Expo, React, provider, database, Azure, or feature-layer
 * dependency or import, and it performs no runtime logic.
 *
 * Motion/haptic behavior is intentionally out of scope (MTS-011).
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

  primary: "#9B7AFF",
  primaryPressed: "#8461F4",
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

/** A semantic color value from the approved palettes. */
export type ColorValue = (typeof lightColors)[SemanticColorKey];

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
