/**
 * Public entry for the Misyra design tokens shell (MTS-003).
 *
 * This package is the future home of the typed visual and motion tokens
 * (technical specification sections 6 and 7, implemented by MTS-008).
 * MTS-003 only establishes the typed package boundary; token values are
 * intentionally not defined yet.
 */

/** Typed shape reserved for the MTS-008 token system. */
export type DesignTokenPalette = Readonly<Record<string, string>>;

/** Declared boundary identity of the design tokens package shell. */
export const designTokensPackage = {
  name: "@misyra/design-tokens",
  boundary: "typed-visual-and-motion-tokens",
} as const;
