/**
 * MTS-009 contract: public primitive boundary / import surface.
 *
 * Feature code must be able to consume the reusable primitives through the
 * intended design-system entry rather than deep-importing internals. This
 * contract proves the single public `index.ts` boundary re-exports the full
 * primitive inventory and that no primitive hardcodes raw colour literals
 * (light/dark palette values must come from `@misyra/design-tokens`).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { fileExists, readText, repoRoot, walkFiles } from "../toolchain/helpers.mjs";

const INDEX = "apps/mobile/src/primitives/index.ts";
const PRIMITIVES_DIR = join(repoRoot, "apps", "mobile", "src", "primitives");

/** The complete public primitive inventory surfaced by the design-system entry. */
const EXPECTED = [
  "Screen",
  "TopBar",
  "SectionHeading",
  "Button",
  "IconButton",
  "TextField",
  "TextArea",
  "Row",
  "SettingsRow",
  "Card",
  "Sheet",
  "Dialog",
  "Toast",
  "EmptyState",
  "Skeleton",
];

test("public primitives boundary exists", () => {
  assert.ok(fileExists(INDEX), "missing public primitives index.ts entry");
});

test("each exported primitive module exists", () => {
  for (const name of EXPECTED) {
    assert.ok(
      fileExists(`apps/mobile/src/primitives/${name}.tsx`),
      `missing primitive module ${name}.tsx`,
    );
  }
});

test("public boundary re-exports the full primitive inventory (no deep imports)", () => {
  const src = readText(INDEX);
  for (const name of EXPECTED) {
    const starExport = src.includes(`export * from "./${name}"`);
    const namedExport = new RegExp(`\\b${name}\\b`).test(src);
    assert.ok(
      starExport || namedExport,
      `index.ts does not surface primitive "${name}"`,
    );
  }
});

test("primitives do not hardcode raw colour literals (they resolve design tokens)", () => {
  const files = walkFiles(PRIMITIVES_DIR, (name) => /\.(ts|tsx)$/.test(name));
  assert.ok(files.length > 0, "expected at least one primitive source file");
  const hex = /#[0-9a-fA-F]{3,8}\b/;
  const rgba = /rgba?\(/;
  for (const file of files) {
    const source = readText(file);
    assert.ok(!hex.test(source), `${file} contains a raw hex colour literal`);
    assert.ok(!rgba.test(source), `${file} contains a raw rgb()/rgba() colour literal`);
  }
});
