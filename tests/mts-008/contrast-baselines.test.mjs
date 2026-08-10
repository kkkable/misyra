/**
 * MTS-008 contract (correction round 2): WCAG-style contrast baselines for
 * ordinary text and controls (technical specification §10.1: "ordinary
 * interface text and controls must meet baseline contrast ... requirements";
 * no special Increase Contrast / Button Shapes adaptation — §10.1 and
 * product specification §7).
 *
 * The contrast calculation is the documented WCAG 2.x formula:
 *   - relative luminance: linearize each sRGB channel (c/12.92 when
 *     c <= 0.03928, otherwise ((c + 0.055) / 1.055) ^ 2.4) and compute
 *     L = 0.2126R + 0.7152G + 0.0722B;
 *   - contrast ratio: (L1 + 0.05) / (L2 + 0.05) with L1 >= L2.
 *
 * The calculation is exported by the design-tokens package as
 * `wcagContrastRatio` so screens and the MTS-009 primitives never invent a
 * second, divergent contrast implementation.
 *
 * Asserted pairings (approved §6.6/§6.7 palette, both modes):
 *   - ordinary text, WCAG 2.1 §1.4.3 baseline 4.5:1:
 *       textPrimary/surface, textSecondary/surface, textPrimary/canvas;
 *   - primary control, WCAG 2.1 §1.4.11 UI-component baseline 3:1:
 *       primaryText/primary, primaryText/primaryPressed.
 *
 * Deliberately NOT asserted (documented scope): textTertiary pairings
 * (tertiary metadata is not "ordinary text" per the specification), status
 * colour / *Soft pairings (status chips are MTS-009 components; their
 * pairing contract belongs to that ticket), and overlay (non-text). No
 * Increase Contrast or Button Shapes behavior is invented.
 *
 * These contracts are intended to FAIL against the reviewed head bc0e357...
 * (which does not export `wcagContrastRatio`) and go green once the helper
 * is implemented. The palette itself is already contract-pinned by
 * design-tokens.test.mjs; the exact-ratio pins below additionally prove the
 * documented calculation matches the reference implementation.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { repoRoot } from "../toolchain/helpers.mjs";

const PACKAGE_DIR = join(repoRoot, "packages", "design-tokens");
const DIST_ENTRY = join(PACKAGE_DIR, "dist", "index.js");

/** Materialize the built public entry in a fresh checkout (same pattern as the other MTS-008 contracts). */
function ensureBuilt() {
  if (!existsSync(DIST_ENTRY)) {
    execFileSync(process.execPath, [join(PACKAGE_DIR, "scripts", "build.mjs")], {
      cwd: PACKAGE_DIR,
      encoding: "utf8",
    });
  }
}

/** @type {any} */ let cachedTokens;

/** @returns {Promise<any>} the design-tokens public entry module */
async function loadTokens() {
  if (cachedTokens === undefined) {
    ensureBuilt();
    cachedTokens = await import(pathToFileURL(DIST_ENTRY).href);
  }
  return cachedTokens;
}

/** Ordinary-text pairings (WCAG 2.1 §1.4.3, 4.5:1) in both modes. */
/** @type {readonly (readonly [string, string])[]} */
const TEXT_PAIRINGS = [
  ["textPrimary", "surface"],
  ["textSecondary", "surface"],
  ["textPrimary", "canvas"],
];

/** Primary-control pairings (WCAG 2.1 §1.4.11, 3:1) in both modes. */
/** @type {readonly (readonly [string, string])[]} */
const CONTROL_PAIRINGS = [
  ["primaryText", "primary"],
  ["primaryText", "primaryPressed"],
];

/**
 * Reference contrast ratios computed with the documented WCAG 2.x formula
 * against the exact §6.6/§6.7 palette values (tolerance ±0.01). Pinning the
 * exact ratios proves the package calculation and the approved palette
 * agree with the documented reference implementation.
 *
 * @type {Record<string, Record<string, number>>}
 */
const EXPECTED_RATIOS = {
  light: {
    "textPrimary/surface": 17.841299,
    "textSecondary/surface": 4.974753,
    "textPrimary/canvas": 16.842107,
    "primaryText/primary": 5.848282,
    "primaryText/primaryPressed": 7.866396,
  },
  dark: {
    "textPrimary/surface": 16.121096,
    "textSecondary/surface": 8.703854,
    "textPrimary/canvas": 17.391433,
    "primaryText/primary": 3.171474,
    "primaryText/primaryPressed": 4.202257,
  },
};

test("wcagContrastRatio is exported and matches the documented WCAG formula", async () => {
  const mod = await loadTokens();
  assert.equal(typeof mod.wcagContrastRatio, "function", "wcagContrastRatio must be exported");
  const ratio = mod.wcagContrastRatio;
  assert.ok(Math.abs(ratio("#FFFFFF", "#FFFFFF") - 1) < 1e-9, "white on white must be 1:1");
  assert.ok(Math.abs(ratio("#FFFFFF", "#000000") - 21) < 1e-9, "white on black must be 21:1");
  assert.ok(Math.abs(ratio("#000000", "#FFFFFF") - 21) < 1e-9, "ratio is order-independent");
});

test("ordinary text pairings meet the 4.5:1 baseline in light and dark", async () => {
  const mod = await loadTokens();
  assert.ok(mod.lightColors, "lightColors must be defined");
  assert.ok(mod.darkColors, "darkColors must be defined");
  for (const mode of ["light", "dark"]) {
    const palette = mode === "light" ? mod.lightColors : mod.darkColors;
    for (const [fg, bg] of TEXT_PAIRINGS) {
      const actual = mod.wcagContrastRatio(palette[fg], palette[bg]);
      assert.ok(
        actual >= 4.5,
        `${mode} ${fg}/${bg} must be >= 4.5:1 for ordinary text, got ${actual.toFixed(2)}:1`,
      );
    }
  }
});

test("ordinary text pairings match the documented reference ratios exactly", async () => {
  const mod = await loadTokens();
  for (const mode of ["light", "dark"]) {
    const palette = mode === "light" ? mod.lightColors : mod.darkColors;
    for (const [fg, bg] of TEXT_PAIRINGS) {
      const actual = mod.wcagContrastRatio(palette[fg], palette[bg]);
      const expected = /** @type {number} */ (
        /** @type {Record<string, number>} */ (EXPECTED_RATIOS[mode])[`${fg}/${bg}`]
      );
      assert.ok(
        Math.abs(actual - expected) < 0.01,
        `${mode} ${fg}/${bg}: expected ${expected.toFixed(6)}:1, got ${actual.toFixed(6)}:1`,
      );
    }
  }
});

test("primary control pairings meet the 3:1 UI-component baseline in light and dark", async () => {
  const mod = await loadTokens();
  for (const mode of ["light", "dark"]) {
    const palette = mode === "light" ? mod.lightColors : mod.darkColors;
    for (const [fg, bg] of CONTROL_PAIRINGS) {
      const actual = mod.wcagContrastRatio(palette[fg], palette[bg]);
      assert.ok(
        actual >= 3,
        `${mode} ${fg}/${bg} must be >= 3:1 for the primary control, got ${actual.toFixed(2)}:1`,
      );
    }
  }
});

test("primary control pairings match the documented reference ratios exactly", async () => {
  const mod = await loadTokens();
  for (const mode of ["light", "dark"]) {
    const palette = mode === "light" ? mod.lightColors : mod.darkColors;
    for (const [fg, bg] of CONTROL_PAIRINGS) {
      const actual = mod.wcagContrastRatio(palette[fg], palette[bg]);
      const expected = /** @type {number} */ (
        /** @type {Record<string, number>} */ (EXPECTED_RATIOS[mode])[`${fg}/${bg}`]
      );
      assert.ok(
        Math.abs(actual - expected) < 0.01,
        `${mode} ${fg}/${bg}: expected ${expected.toFixed(6)}:1, got ${actual.toFixed(6)}:1`,
      );
    }
  }
});
