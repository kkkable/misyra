/**
 * MTS-008 contract (correction round 3): WCAG-style contrast baselines for
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
 *   - primary-button LABEL text (primaryText on primary/primaryPressed) at
 *     the approved ordinary control typography (§6.5 `body`: 16 pt,
 *     400/500 — ordinary-size text, not WCAG large text), WCAG 2.1 §1.4.3
 *     baseline 4.5:1, in both light and dark modes and both normal and
 *     pressed states (correction round 3: previously asserted only at the
 *     3:1 UI-component boundary, which is not sufficient for the label
 *     text itself — technical specification §10.1 requires baseline
 *     contrast for ordinary interface text);
 *   - primary control non-text/boundary contrast, WCAG 2.1 §1.4.11
 *     baseline 3:1: primaryText/primary, primaryText/primaryPressed —
 *     kept semantically separate and never used as a substitute for the
 *     label-text baseline above.
 *
 * Deliberately NOT asserted (documented scope): textTertiary pairings
 * (tertiary metadata is not "ordinary text" per the specification), status
 * colour / *Soft pairings (status chips are MTS-009 components; their
 * pairing contract belongs to that ticket), and overlay (non-text). No
 * Increase Contrast or Button Shapes behavior is invented.
 *
 * The round-2 contracts (motion/elevation, colour guard, ColorValue) are
 * preserved and remain green. The round-3 label-text contract below is
 * intended to FAIL against the reviewed head fc999e6... specifically
 * because the dark-mode primary label pairings are below 4.5:1
 * (primaryText/primary ≈ 3.17:1, primaryText/primaryPressed ≈ 4.20:1).
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

/**
 * Primary-control pairings (WCAG 2.1 §1.4.11, 3:1) in both modes. These are
 * the non-text UI-component/boundary contrast pairs (the button's filled
 * shape against the surrounding interface). They are NOT the label-text
 * contract: the same pairs are asserted separately at the 4.5:1
 * ordinary-text baseline via LABEL_TEXT_PAIRINGS below. The 3:1 check is
 * never a substitute for the label-text baseline.
 */
/** @type {readonly (readonly [string, string])[]} */
const CONTROL_PAIRINGS = [
  ["primaryText", "primary"],
  ["primaryText", "primaryPressed"],
];

/**
 * Primary-button LABEL-TEXT pairings: the exact foreground/background pairs
 * an MTS-009 PrimaryButton label consumes. Per technical specification §6.5
 * the ordinary control typography is `body` (16 pt, 400/500) — ordinary-size
 * text under WCAG 2.1 §1.4.3 (below the 18 pt regular / 14 pt bold
 * large-text thresholds) — so the label text must meet the 4.5:1
 * normal-text baseline in BOTH light and dark modes, for the normal AND
 * pressed states (technical specification §10.1).
 */
/** @type {readonly (readonly [string, string])[]} */
const LABEL_TEXT_PAIRINGS = [
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
    "primaryText/primary": 5.582524,
    "primaryText/primaryPressed": 5.280157,
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

test("primary control non-text pairings meet the 3:1 UI-component boundary baseline (label text is NOT covered by this check)", async () => {
  const mod = await loadTokens();
  for (const mode of ["light", "dark"]) {
    const palette = mode === "light" ? mod.lightColors : mod.darkColors;
    for (const [fg, bg] of CONTROL_PAIRINGS) {
      const actual = mod.wcagContrastRatio(palette[fg], palette[bg]);
      assert.ok(
        actual >= 3,
        `${mode} ${fg}/${bg} must be >= 3:1 for the primary control boundary, got ${actual.toFixed(2)}:1`,
      );
    }
  }
});

test("primary button label text uses ordinary-size typography, so the 4.5:1 baseline applies", async () => {
  const mod = await loadTokens();
  assert.ok(mod.typography, "typography must be defined");
  const body = mod.typography.body;
  assert.ok(body, "typography.body must be defined");
  // §6.5: `body` is the approved "main text and controls" token.
  assert.equal(body.size, 16, "approved ordinary control typography is 16 pt (§6.5)");
  assert.deepEqual(
    [...body.weight].sort((a, b) => a - b),
    [400, 500],
    "approved body weights are 400/500 (§6.5)",
  );
  // WCAG 2.1 §1.4.3 large text: at least 18 pt regular OR at least 14 pt bold (weight >= 700).
  const isRegularLargeText = body.size >= 18;
  const isBoldLargeText = body.size >= 14 && body.weight.includes(700);
  assert.ok(
    !isRegularLargeText && !isBoldLargeText,
    "the approved ordinary control typography (body 16 pt 400/500) is ordinary-size text, so 4.5:1 applies; a large-text exemption would require an approved typography change",
  );
});

test("primary button label text meets the 4.5:1 ordinary-text baseline in light and dark (normal and pressed)", async () => {
  const mod = await loadTokens();
  for (const mode of ["light", "dark"]) {
    const palette = mode === "light" ? mod.lightColors : mod.darkColors;
    for (const [fg, bg] of LABEL_TEXT_PAIRINGS) {
      const actual = mod.wcagContrastRatio(palette[fg], palette[bg]);
      assert.ok(
        actual >= 4.5,
        `${mode} ${fg}/${bg} must be >= 4.5:1 for primary-button label text (ordinary-size text, §10.1 baseline), got ${actual.toFixed(2)}:1`,
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
