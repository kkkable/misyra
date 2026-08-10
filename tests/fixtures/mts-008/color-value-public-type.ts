/**
 * MTS-008 correction fixture: the exported public `ColorValue` type must
 * accept approved semantic color values from BOTH the light (§6.6) and dark
 * (§6.7) palettes through the package public type surface, while still
 * rejecting arbitrary non-token colors (the contract is a literal union,
 * not an unconstrained string).
 *
 * This fixture deliberately FAILS at the reviewed head 6c3c2b4 (the
 * light-only `ColorValue` rejects valid dark literals) and must compile
 * cleanly after the type-only correction. It is compiled by
 * tests/mts-008/design-tokens.test.mjs via the shared strict TypeScript
 * configuration; it is excluded from repository-wide typecheck/lint and
 * Prettier via the tests/fixtures ignore rules.
 */
import type { ColorValue } from "../../../packages/design-tokens/dist/index.js";

/** Approved dark-mode literals must be assignable to ColorValue. */
export const darkPrimary: ColorValue = "#6D3DFF";
export const darkVerified: ColorValue = "#54CF83";
export const darkCanvas: ColorValue = "#11111A";
export const darkOverlay: ColorValue = "rgba(0, 0, 0, 0.62)";

/** Approved light-mode literals must remain assignable (no regression). */
export const lightPrimary: ColorValue = "#6D3CF3";
export const lightVerified: ColorValue = "#22A95B";
export const lightOverlay: ColorValue = "rgba(18, 18, 32, 0.38)";

/**
 * The type stays a literal union: an arbitrary non-token color is rejected.
 * If `ColorValue` were weakened to `string`, the `@ts-expect-error` below
 * would become unused and fail the fixture compile.
 */
// @ts-expect-error arbitrary non-token color must not be assignable to ColorValue
export const arbitrary: ColorValue = "#123456";
