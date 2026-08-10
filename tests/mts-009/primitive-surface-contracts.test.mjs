/**
 * MTS-009 correction contracts: the real text-rendering and interactive
 * surfaces of the primitives must consume the approved design-system
 * contracts — not merely their labels, and not merely helper functions
 * tested in isolation (COMMANDER DIRECTIVE 2026-08-10T13:13:01Z findings).
 *
 * Gates:
 *   1. the actual `TextInput` surface in `TextField` and `TextArea` consumes
 *      the approved §6.5 `body` semantic typography token at an approved
 *      weight — entered/placeholder text must not fall back to an
 *      uncontrolled platform default;
 *   2. every text-rendering surface (`Text` and `TextInput`) in the whole
 *      primitive layer routes typography through `semanticTypographyStyle()`;
 *   3. an interactive `Card` (onPress present) applies the 44 × 44 touch
 *      target floor to its real `Pressable`, so minimal children cannot
 *      shrink the target below the §6.1 minimum;
 *   4. `Button`/`IconButton` keep applying the floor to their real
 *      `Pressable` surfaces, and the tappable `Row` keeps its 44 pt height
 *      floor — the existing interactive-primitive contracts stay intact.
 *
 * These contracts intentionally FAIL at the reviewed head `914e36e` (input
 * surfaces carry no typography; interactive Card has no floor) and go green
 * once the real primitive surfaces consume the contracts.
 *
 * Round 3 (COMMANDER DIRECTIVE 2026-08-10T15:03:53Z findings) adds:
 *   5. a normal enabled `Button` routes the real `Pressable` callback's
 *      `pressed=true` path through the approved `buttonColors()` resolver
 *      (primary reaches `primaryPressed`, secondary its approved pressed
 *      mapping) instead of only dimming opacity;
 *   6. the runtime pressed colour path stays gated on `state === "normal"`
 *      so disabled/loading buttons never resolve the interactive pressed
 *      state, and no raw colour literal replaces the approved resolver;
 *   7. the actual `TextField` `TextInput` surface guarantees the 44 pt
 *      interactive height floor through the shared MTS-009 mechanism,
 *      while `TextArea` keeps its explicit 120 pt minimum.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { readText, repoRoot, walkFiles } from "../toolchain/helpers.mjs";

const PRIMITIVES_DIR = join(repoRoot, "apps", "mobile", "src", "primitives");
const CORE_REL = "apps/mobile/src/primitives/core.ts";
// Compiled under apps/mobile/node_modules so the emitted module resolves the
// @misyra/design-tokens workspace package at runtime. node_modules/ is ignored.
const TOKENS_ENTRY = join(repoRoot, "packages", "design-tokens", "dist", "index.js");

/**
 * Materialize the built design-tokens public entry in a fresh checkout when
 * dist is absent (CI runs Typecheck before Build). The package build is pure
 * `tsc` — no network, no toolchain beyond the already-installed compiler.
 */
function ensureBuilt() {
  if (!existsSync(TOKENS_ENTRY)) {
    execFileSync(
      process.execPath,
      [join(repoRoot, "packages", "design-tokens", "scripts", "build.mjs")],
      {
        cwd: join(repoRoot, "packages", "design-tokens"),
        encoding: "utf8",
      },
    );
  }
}

/** @type {any} */ let cachedTokens;

/** Load the built design-tokens public entry once per run. */
async function loadTokens() {
  if (cachedTokens === undefined) {
    ensureBuilt();
    cachedTokens = await import(pathToFileURL(TOKENS_ENTRY).href);
  }
  return cachedTokens;
}

/** Every primitive source file (relative POSIX paths). */
function primitiveSources() {
  return walkFiles(PRIMITIVES_DIR, (name) => /\.(ts|tsx)$/.test(name));
}

/**
 * Extract the JSX block of every text-rendering surface in a primitive
 * source: `<Text>…</Text>` elements and self-closing `<TextInput … />`s.
 * Returns `{ kind, block }` pairs in source order.
 *
 * @param {string} source
 */
function textSurfaces(source) {
  const surfaces = [];
  const re = /<Text(?:Input)?\b/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    if (source.startsWith("<TextInput", match.index)) {
      const end = source.indexOf("/>", match.index);
      assert.notEqual(end, -1, "unterminated <TextInput element");
      surfaces.push({ kind: "TextInput", block: source.slice(match.index, end + 2) });
      re.lastIndex = end + 2;
    } else {
      const end = source.indexOf("</Text>", match.index);
      assert.notEqual(end, -1, "unterminated <Text element");
      surfaces.push({ kind: "Text", block: source.slice(match.index, end + 7) });
      re.lastIndex = end + 7;
    }
  }
  return surfaces;
}

/**
 * Extract the approved `body` weight passed to semanticTypographyStyle in a
 * block, or null when the call is absent.
 *
 * @param {string} block
 * @returns {number | null}
 */
function bodyWeightUsed(block) {
  const call = block.match(/semanticTypographyStyle\(\s*["']body["'],\s*(\d+)\s*\)/);
  return call ? Number(call[1]) : null;
}

test("TextField TextInput consumes the approved body typography token", async () => {
  const source = readText("apps/mobile/src/primitives/TextField.tsx");
  const inputs = textSurfaces(source).filter((surface) => surface.kind === "TextInput");
  assert.equal(inputs.length, 1, "TextField must contain exactly one TextInput text surface");
  const input = inputs[0];
  assert.ok(input, "the single TextInput surface must exist");
  const block = input.block;
  assert.ok(
    block.includes('semanticTypographyStyle("body"'),
    "the TextInput surface must consume the §6.5 body semantic typography token; " +
      "its style currently carries no typography and falls back to the platform default",
  );
  const { typography } = await loadTokens();
  assert.ok(
    typography.body.weight.includes(bodyWeightUsed(block)),
    `TextInput body weight ${bodyWeightUsed(block)} is not approved (${typography.body.weight.join("/")})`,
  );
});

test("TextArea TextInput consumes the approved body typography token", async () => {
  const source = readText("apps/mobile/src/primitives/TextArea.tsx");
  const inputs = textSurfaces(source).filter((surface) => surface.kind === "TextInput");
  assert.equal(inputs.length, 1, "TextArea must contain exactly one TextInput text surface");
  const input = inputs[0];
  assert.ok(input, "the single TextInput surface must exist");
  const block = input.block;
  assert.ok(
    block.includes('semanticTypographyStyle("body"'),
    "the TextInput surface must consume the §6.5 body semantic typography token; " +
      "its style currently carries no typography and falls back to the platform default",
  );
  const { typography } = await loadTokens();
  assert.ok(
    typography.body.weight.includes(bodyWeightUsed(block)),
    `TextInput body weight ${bodyWeightUsed(block)} is not approved (${typography.body.weight.join("/")})`,
  );
});

test("every text-rendering surface in the primitive layer consumes the semantic typography contract", () => {
  const files = primitiveSources();
  assert.ok(files.length > 0, "expected at least one primitive source file");
  for (const file of files) {
    if (file === CORE_REL) continue; // authorized typography helper module
    const surfaces = textSurfaces(readText(file));
    // Pass-through containers (Card, Skeleton, Screen, IconButton) render
    // caller-supplied children and define no text surfaces of their own.
    if (surfaces.length === 0) continue;
    for (const surface of surfaces) {
      assert.ok(
        surface.block.includes("semanticTypographyStyle("),
        `${file} ${surface.kind} surface does not consume semanticTypographyStyle(); ` +
          "raw/platform-default text surfaces are forbidden in the primitive layer",
      );
    }
  }
});

test("interactive Card applies the 44x44 touch-target floor to its Pressable", () => {
  const source = readText("apps/mobile/src/primitives/Card.tsx");
  const start = source.indexOf("<Pressable");
  assert.notEqual(start, -1, "interactive Card must render a Pressable when onPress is present");
  const end = source.indexOf("</Pressable>", start);
  assert.notEqual(end, -1, "interactive Card Pressable must be terminated");
  const block = source.slice(start, end + 11);
  assert.ok(
    block.includes("minTouchTargetStyle("),
    "the interactive Card Pressable must apply minTouchTargetStyle() so empty/minimal " +
      "children cannot shrink the touch target below 44 × 44",
  );
});

test("Button and IconButton keep the 44x44 floor on their real pressable surfaces", () => {
  for (const file of ["Button.tsx", "IconButton.tsx"]) {
    const source = readText(`apps/mobile/src/primitives/${file}`);
    const start = source.indexOf("<Pressable");
    assert.notEqual(start, -1, `${file} must render a Pressable`);
    const end = source.indexOf("</Pressable>", start);
    assert.notEqual(end, -1, `${file} Pressable must be terminated`);
    const block = source.slice(start, end + 11);
    assert.ok(
      block.includes("minTouchTargetStyle("),
      `${file} Pressable must keep applying minTouchTargetStyle()`,
    );
  }
});

test("tappable Row keeps the 44pt height floor", () => {
  const source = readText("apps/mobile/src/primitives/Row.tsx");
  assert.ok(
    source.includes("minHeight: MIN_TOUCH_TARGET"),
    "Row layout must keep the 44 pt height floor drawn from MIN_TOUCH_TARGET",
  );
  const start = source.indexOf("<Pressable");
  assert.notEqual(start, -1, "tappable Row must render a Pressable");
  const end = source.indexOf("</Pressable>", start);
  const block = source.slice(start, end + 11);
  assert.ok(
    block.includes("layout"),
    "tappable Row Pressable must apply the shared layout carrying the 44 pt floor",
  );
});

test("SettingsRow forwards interactivity to Row so its interactive path reuses the 44pt floor", () => {
  const source = readText("apps/mobile/src/primitives/SettingsRow.tsx");
  assert.ok(
    !source.includes("<Pressable"),
    "SettingsRow must not open a second interactive path beside Row's",
  );
  assert.ok(
    source.includes("...(onPress ? { onPress } : {})"),
    "SettingsRow must forward onPress to Row so the interactive path inherits the 44 pt floor",
  );
});

test("normal enabled Button routes the Pressable pressed path through the approved pressed-state colours", () => {
  const source = readText("apps/mobile/src/primitives/Button.tsx");
  const start = source.indexOf("<Pressable");
  assert.notEqual(start, -1, "Button must render a Pressable");
  const end = source.indexOf("</Pressable>", start);
  assert.notEqual(end, -1, "Button Pressable must be terminated");
  const block = source.slice(start, end + 11);
  const styleStart = block.indexOf("style={");
  assert.notEqual(styleStart, -1, "Button Pressable must define a style callback");
  const styleCallback = block.slice(styleStart);
  assert.ok(
    /style=\{\s*\(\{ pressed \}\)\s*=>/.test(styleCallback),
    "the Button Pressable style must consume the runtime pressed argument",
  );
  // The pressed boolean may still tint opacity, but the actual pressed visual
  // colours must come from the approved resolver — exactly like IconButton's
  // runtime pattern — not from an opacity-only dim.
  assert.ok(
    /buttonColors\(\s*mode\s*,\s*variant\s*,\s*["']pressed["']\s*\)/.test(styleCallback),
    "the runtime pressed path must re-resolve the approved pressed-state colours through " +
      'buttonColors(mode, variant, "pressed") so primary reaches t.primaryPressed and ' +
      "secondary its approved pressed mapping; a normal enabled Button currently only " +
      "changes opacity while physically pressed",
  );
});

test("disabled and loading Buttons never enter the interactive pressed colour state", () => {
  const source = readText("apps/mobile/src/primitives/Button.tsx");
  const start = source.indexOf("<Pressable");
  assert.notEqual(start, -1, "Button must render a Pressable");
  const end = source.indexOf("</Pressable>", start);
  assert.notEqual(end, -1, "Button Pressable must be terminated");
  const block = source.slice(start, end + 11);
  const styleStart = block.indexOf("style={");
  assert.notEqual(styleStart, -1, "Button Pressable must define a style callback");
  const styleCallback = block.slice(styleStart);
  assert.ok(
    /state === "normal" && pressed|pressed && state === "normal"/.test(styleCallback),
    'the runtime pressed colour path must be gated on state === "normal" so disabled and ' +
      "loading buttons keep their approved non-interactive colours",
  );
});

test("Button introduces no raw colour literal beside the approved resolver", () => {
  const source = readText("apps/mobile/src/primitives/Button.tsx");
  const rawColour = source.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  assert.equal(
    rawColour,
    null,
    "Button must resolve every colour through the approved buttonColors() contract; " +
      "a raw colour literal would bypass the §6.6 token boundary",
  );
});

test("TextField TextInput surface guarantees the 44 pt interactive height floor", () => {
  const source = readText("apps/mobile/src/primitives/TextField.tsx");
  const inputs = textSurfaces(source).filter((surface) => surface.kind === "TextInput");
  assert.equal(inputs.length, 1, "TextField must contain exactly one TextInput text surface");
  const input = inputs[0];
  assert.ok(input, "the single TextInput surface must exist");
  const block = input.block;
  assert.ok(
    block.includes("minHeight: MIN_TOUCH_TARGET") || block.includes("minTouchTargetStyle("),
    "the editable TextField surface must guarantee at least MIN_TOUCH_TARGET (44 pt) through " +
      "an existing shared MTS-009 mechanism; it currently relies on font metrics and padding " +
      "and can fall below the §6.1/§6.2 interactive floor",
  );
});

test("TextArea keeps an interactive height above the 44 pt floor", () => {
  const source = readText("apps/mobile/src/primitives/TextArea.tsx");
  const inputs = textSurfaces(source).filter((surface) => surface.kind === "TextInput");
  assert.equal(inputs.length, 1, "TextArea must contain exactly one TextInput text surface");
  const input = inputs[0];
  assert.ok(input, "the single TextInput surface must exist");
  const block = input.block;
  assert.ok(
    /minHeight:\s*120/.test(block),
    "TextArea must keep its explicit 120 pt minimum, which exceeds the 44 pt floor",
  );
});
