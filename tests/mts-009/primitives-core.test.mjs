/**
 * MTS-009 contract: foundational UI primitive core (framework-free).
 *
 * The primitive core is deliberately renderer-independent so its deterministic
 * contracts (touch targets, interaction-state accessibility payloads, a11y
 * roles, token-resolved colors, wrapping) can be proven with `node --test`
 * before and independent of any React Native renderer.
 *
 * We compile `core.ts` with the repository TypeScript compiler and import the
 * emitted module so the assertions exercise the real implementation and the
 * real `@misyra/design-tokens` theme objects.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { themes, wcagContrastRatio } from "../../packages/design-tokens/dist/index.js";
import { repoRoot } from "../toolchain/helpers.mjs";

const CORE = join(repoRoot, "apps", "mobile", "src", "primitives", "core.ts");
// Compiled under apps/mobile/node_modules so the emitted module resolves the
// @misyra/design-tokens workspace package at runtime. node_modules/ is ignored.
const OUT = join(repoRoot, "apps", "mobile", "node_modules", ".mts009-core");

/** @type {Record<string, any> | undefined} */
let cached;

/** Compile and import the primitive core once per run. */
async function loadCore() {
  if (cached === undefined) {
    execFileSync(
      process.execPath,
      [
        join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
        CORE,
        "--outDir",
        OUT,
        "--module",
        "esnext",
        "--moduleResolution",
        "bundler",
        "--target",
        "es2022",
        "--skipLibCheck",
        "--esModuleInterop",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    cached = await import(pathToFileURL(join(OUT, "core.js")).href);
  }
  return cached;
}

test("touch targets respect the 44x44 point floor", async () => {
  const core = await loadCore();
  assert.equal(core.MIN_TOUCH_TARGET, 44);
  assert.deepEqual(core.minTouchTargetStyle(), { minWidth: 44, minHeight: 44 });
  assert.deepEqual(core.minTouchTargetStyle({ width: 20, height: 20 }), {
    minWidth: 44,
    minHeight: 44,
  });
  // Glyphs larger than the floor raise the target rather than shrink it.
  assert.deepEqual(core.minTouchTargetStyle({ width: 52, height: 40 }), {
    minWidth: 52,
    minHeight: 44,
  });
});

test("interaction states map to accessibility payloads", async () => {
  const core = await loadCore();
  assert.deepEqual(core.interactionAccessibility("disabled"), { disabled: true });
  assert.deepEqual(core.interactionAccessibility("loading"), {
    busy: true,
    disabled: true,
  });
  assert.deepEqual(core.interactionAccessibility("selected"), { selected: true });
  assert.deepEqual(core.interactionAccessibility("pressed"), { pressed: true });
  assert.deepEqual(core.interactionAccessibility("error"), { error: true });
  assert.deepEqual(core.interactionAccessibility("focused"), {});
  assert.deepEqual(core.interactionAccessibility("default"), {});
});

test("accessibility roles are defined for every primitive kind", async () => {
  const core = await loadCore();
  const expected = {
    button: "button",
    iconButton: "button",
    header: "header",
    textField: "text",
    textArea: "text",
    emptyState: "summary",
    toast: "alert",
    progressbar: "progressbar",
    dialog: "alert",
  };
  for (const [kind, role] of Object.entries(expected)) {
    assert.equal(core.primitiveA11yRole(kind), role, `role for ${kind}`);
  }
});

test("primary button label meets 4.5:1 contrast in both themes", async () => {
  const core = await loadCore();
  for (const mode of ["light", "dark"]) {
    const actual = core.primaryLabelContrast(mode);
    assert.ok(actual >= 4.5, `${mode} primary label contrast ${actual} < 4.5`);
    assert.equal(
      actual,
      wcagContrastRatio(themes[mode].primaryText, themes[mode].primary),
      `${mode} primary contrast must be computed from approved tokens`,
    );
  }
});

test("button variants resolve approved tokens across states and themes", async () => {
  const core = await loadCore();
  for (const mode of ["light", "dark"]) {
    const t = themes[mode];
    assert.deepEqual(core.buttonColors(mode, "primary", "normal"), {
      background: t.primary,
      foreground: t.primaryText,
    });
    assert.deepEqual(core.buttonColors(mode, "primary", "pressed"), {
      background: t.primaryPressed,
      foreground: t.primaryText,
    });
    assert.deepEqual(core.buttonColors(mode, "secondary", "normal"), {
      background: t.surface,
      foreground: t.textPrimary,
    });
    assert.deepEqual(core.buttonColors(mode, "destructive", "normal"), {
      background: t.destructiveSoft,
      foreground: t.destructive,
    });
    assert.deepEqual(core.buttonColors(mode, "primary", "disabled"), {
      background: t.surfaceMuted,
      foreground: t.textTertiary,
    });
  }
});

test("secondary and destructive labels keep control contrast in both themes", async () => {
  const core = await loadCore();
  for (const mode of ["light", "dark"]) {
    const secondary = core.buttonColors(mode, "secondary", "normal");
    const destructive = core.buttonColors(mode, "destructive", "normal");
    assert.ok(
      wcagContrastRatio(secondary.foreground, secondary.background) >= 4.5,
      `${mode} secondary label contrast`,
    );
    assert.ok(
      wcagContrastRatio(destructive.foreground, destructive.background) >= 3,
      `${mode} destructive control contrast`,
    );
  }
});

test("filled fields expose per-state colors from approved tokens", async () => {
  const core = await loadCore();
  for (const mode of ["light", "dark"]) {
    const t = themes[mode];
    assert.deepEqual(core.fieldColors(mode, "filled", "normal"), {
      background: t.surface,
      border: t.border,
      foreground: t.textPrimary,
      placeholder: t.textTertiary,
    });
    assert.deepEqual(core.fieldColors(mode, "filled", "focused"), {
      background: t.surface,
      border: t.primary,
      foreground: t.textPrimary,
      placeholder: t.textTertiary,
    });
    assert.deepEqual(core.fieldColors(mode, "filled", "error"), {
      background: t.surface,
      border: t.destructive,
      foreground: t.textPrimary,
      placeholder: t.textTertiary,
    });
    assert.deepEqual(core.fieldColors(mode, "filled", "disabled"), {
      background: t.surfaceMuted,
      border: t.border,
      foreground: t.textTertiary,
      placeholder: t.textTertiary,
    });
  }
});

test("icon buttons resolve approved tokens across states", async () => {
  const core = await loadCore();
  for (const mode of ["light", "dark"]) {
    const t = themes[mode];
    assert.deepEqual(core.iconButtonColors(mode, "normal"), {
      background: t.surface,
      foreground: t.textPrimary,
    });
    assert.deepEqual(core.iconButtonColors(mode, "pressed"), {
      background: t.surfaceMuted,
      foreground: t.textPrimary,
    });
    assert.deepEqual(core.iconButtonColors(mode, "disabled"), {
      background: t.surfaceMuted,
      foreground: t.textTertiary,
    });
  }
});

test("surface and text tokens resolve to approved theme values", async () => {
  const core = await loadCore();
  for (const mode of ["light", "dark"]) {
    const t = themes[mode];
    assert.equal(core.surfaceToken(mode, "canvas"), t.canvas);
    assert.equal(core.surfaceToken(mode, "surface"), t.surface);
    assert.equal(core.surfaceToken(mode, "surfaceMuted"), t.surfaceMuted);
    assert.equal(core.textToken(mode, "textPrimary"), t.textPrimary);
    assert.equal(core.textToken(mode, "textSecondary"), t.textSecondary);
  }
});

test("large-text wrapping style keeps action labels wrappable", async () => {
  const core = await loadCore();
  assert.deepEqual(core.wrappableTextStyle(), { flexShrink: 1, flexWrap: "wrap" });
});

test("layout constants are drawn from the approved space scale", async () => {
  const core = await loadCore();
  assert.equal(core.SCREEN_HORIZONTAL_PADDING, 16);
  assert.equal(core.LARGE_SECTION_SPACING, 24);
});
