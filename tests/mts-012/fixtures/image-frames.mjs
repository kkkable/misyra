/**
 * MTS-012 image-layer fixtures — deterministic capture matrix data.
 *
 * The MTS-012 screenshot-generation layer (COMMANDER DIRECTIVE
 * 2026-08-11T19:05:20Z, issue #4 comment 5257609976) renders the REAL
 * MTS-009 primitive inventory and the REAL MTS-010 shell-screen surface in
 * headless chromium and compares the generated PNG artifacts against
 * committed, platform-separated baselines.
 *
 * This file ships with the RED commit (like `device-frames.mjs` for the
 * manifest layer): deterministic data and the deterministic naming rules
 * derived from it. The capture logic itself lives in `../image-harness/`
 * and does NOT exist at the RED head, so every capture-dependent contract
 * fails with ERR_MODULE_NOT_FOUND for the intended missing-layer reason.
 *
 * Design notes (documented model of the image layer):
 * - Only the "web" platform can be captured by the CI headless-chromium
 *   path (no native simulators are part of this harness). Baselines are
 *   stored under `image-baselines/<platform>/` so native baselines can be
 *   added later without mixing platforms; comparisons never cross
 *   platforms.
 * - Sizes: the directive requires a minimum of 360×800 and 412×915.
 * - Surfaces: "primitives" (the REAL MTS-009 primitive inventory rendered
 *   together) and "shell-screen" (the REAL MTS-010 four-tab shell's
 *   Calendar root — PlaceholderScreen). PlaceholderScreen is deliberately
 *   appearance-independent (fixed, approved placeholder palette; no mode
 *   prop), so its image baselines cover light only; the full light/dark
 *   requirement is satisfied by the primitives surface, whose inventory
 *   renders both approved appearances. The manifest layer continues to
 *   model dark layouts for the shell (layout contracts, not pixels).
 * - Text scales reuse the approved manifest scales: 1 (default) and 2
 *   (large text).
 * - Capture order is deterministic and locale-major. Android changes the
 *   device locale by restarting the framework, so every consumer of this
 *   matrix must finish one locale before moving to the next. This makes
 *   baseline generation and verification enter each fixture from the same
 *   device-state transition instead of silently depending on loop nesting.
 */
import { join } from "node:path";

import { repoRoot } from "../../toolchain/helpers.mjs";
import { APPEARANCES, LOCALES, TEXT_SCALES } from "./device-frames.mjs";

/**
 * Capture combo shape — every screenshot is fully described by these five
 * deterministic dimensions (the platform is carried by the directory
 * namespace and passed separately to the capture step).
 * @typedef {{
 *   surface: "primitives" | "shell-screen";
 *   width: number;
 *   height: number;
 *   appearance: "light" | "dark";
 *   locale: "en" | "zh-HK";
 *   textScale: 1 | 2;
 * }} ImageCombo
 */

/** Committed image-baseline root (never written by normal test runs). */
export const IMAGE_BASELINES_DIR = join(repoRoot, "tests", "mts-012", "image-baselines");

/**
 * Capturable screenshot surfaces. "shell-screen" is the REAL MTS-010
 * PlaceholderScreen (Calendar root); "primitives" is the REAL MTS-009
 * primitive inventory composed into one deterministic screen.
 * @type {readonly ("primitives" | "shell-screen")[]}
 */
export const IMAGE_SURFACES = Object.freeze(["primitives", "shell-screen"]);

/**
 * Platforms the capture step can actually render in CI. Only "web"
 * (headless chromium) today; the namespace is extensible.
 * @type {readonly string[]}
 */
export const IMAGE_BASELINE_PLATFORMS = Object.freeze(["web", "android"]);

/**
 * Directive-mandated minimum sizes for captured screenshots (§6.2
 * portrait phone frames 360×800 and 412×915).
 * @type {readonly { readonly width: number; readonly height: number }[]}
 */
export const IMAGE_SIZES = Object.freeze([
  Object.freeze({ width: 360, height: 800 }),
  Object.freeze({ width: 412, height: 915 }),
]);

/**
 * Every image baseline required by the directive:
 * - primitives: every size × appearance × locale × text scale (16);
 * - shell-screen: every size × locale × text scale at light (8), because
 *   the REAL PlaceholderScreen renders an appearance-independent palette.
 *
 * Locale is intentionally the outermost dimension. Android applies locale
 * through a framework restart, so this canonical order groups all English
 * captures before all zh-HK captures. Baseline generation and verification
 * therefore exercise the exact same Android state-transition sequence.
 * @returns {{ surface: string; width: number; height: number; appearance: string; locale: string; textScale: number }[]}
 */
export function requiredImageCombos() {
  /** @type {{ surface: string; width: number; height: number; appearance: string; locale: string; textScale: number }[]} */
  const combos = [];
  for (const locale of LOCALES) {
    for (const surface of IMAGE_SURFACES) {
      const appearances = surface === "shell-screen" ? ["light"] : APPEARANCES;
      for (const size of IMAGE_SIZES) {
        for (const appearance of appearances) {
          for (const textScale of TEXT_SCALES) {
            combos.push({
              surface,
              width: size.width,
              height: size.height,
              appearance,
              locale,
              textScale,
            });
          }
        }
      }
    }
  }
  return combos;
}

/**
 * Deterministic baseline file name for a capture combo, e.g.
 * `primitives-360x800-light-en-1x.png` or
 * `shell-screen-412x915-light-zh-HK-2x.png`. The file always lives under
 * `image-baselines/<platform>/<name>`; the platform is carried by the
 * directory namespace, never by cross-platform comparison.
 * @param {{ surface: string; width: number; height: number; appearance: string; locale: string; textScale: number }} combo
 * @returns {string}
 */
export function imageBaselineName(combo) {
  return `${combo.surface}-${combo.width}x${combo.height}-${combo.appearance}-${combo.locale}-${combo.textScale}x.png`;
}
