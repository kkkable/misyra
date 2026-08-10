/**
 * MTS-009 correction contract: primitive typography must resolve from the
 * approved @misyra/design-tokens semantic typography contract (technical
 * specification §6.5) instead of raw font-size/font-weight literals.
 *
 * Gates:
 *   1. no primitive module (other than the authorized typography helper in
 *      core.ts) declares a raw numeric `fontSize` literal;
 *   2. no primitive module declares a raw `fontWeight` literal (string or
 *      number);
 *   3. the semantic typography helper derives every emitted style from the
 *      approved token inventory (size + approved weight), rejects weights
 *      outside a token's approved set, and never inlines raw literals;
 *   4. typography property declarations surface only through the authorized
 *      helper module (core.ts) — every other primitive routes text styling
 *      through `semanticTypographyStyle()`.
 *
 * This suite is intended to FAIL at the reviewed head (4005d03, before the
 * typography correction) for exactly the hard-coded-typography reason, and
 * go green once the primitives consume the semantic typography tokens.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { readText, repoRoot, walkFiles } from "../toolchain/helpers.mjs";

const PRIMITIVES_DIR = join(repoRoot, "apps", "mobile", "src", "primitives");
const CORE_REL = "apps/mobile/src/primitives/core.ts";
const CORE = join(repoRoot, CORE_REL);
const INDEX = "apps/mobile/src/primitives/index.ts";
// Compiled under apps/mobile/node_modules so the emitted module resolves the
// @misyra/design-tokens workspace package at runtime. node_modules/ is ignored.
const OUT = join(repoRoot, "apps", "mobile", "node_modules", ".mts009-typography");
const TOKENS_ENTRY = join(repoRoot, "packages", "design-tokens", "dist", "index.js");

/** Raw numeric fontSize literal, e.g. `fontSize: 16`. */
const RAW_FONT_SIZE = /fontSize\s*:\s*\d+(\.\d+)?/;
/** Raw fontWeight literal, e.g. `fontWeight: "600"` or `fontWeight: 600`. */
const RAW_FONT_WEIGHT = /fontWeight\s*:\s*(?:["']\d+["']|\d+)/;

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

/** @type {any} */ let cachedCore;
/** @type {any} */ let cachedTokens;

/** Compile and import the primitive core once per run. */
async function loadCore() {
  if (cachedCore === undefined) {
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
    cachedCore = await import(pathToFileURL(join(OUT, "core.js")).href);
  }
  return cachedCore;
}

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

test("primitives do not declare raw fontSize literals (semantic typography contract)", () => {
  const files = primitiveSources();
  assert.ok(files.length > 0, "expected at least one primitive source file");
  for (const file of files) {
    if (file === CORE_REL) continue; // authorized typography helper module
    const source = readText(file);
    assert.ok(
      !RAW_FONT_SIZE.test(source),
      `${file} declares a raw fontSize literal; resolve semanticTypographyStyle() instead`,
    );
  }
});

test("primitives do not declare raw fontWeight literals", () => {
  const files = primitiveSources();
  for (const file of files) {
    if (file === CORE_REL) continue; // authorized typography helper module
    const source = readText(file);
    assert.ok(
      !RAW_FONT_WEIGHT.test(source),
      `${file} declares a raw fontWeight literal; resolve the weight from an approved semantic typography token`,
    );
  }
});

test("semantic typography helper resolves the approved §6.5 token inventory", async () => {
  const core = await loadCore();
  const tokens = await loadTokens();
  assert.equal(
    typeof core.semanticTypographyStyle,
    "function",
    "core must export semanticTypographyStyle() resolving approved typography tokens",
  );
  for (const [key, token] of Object.entries(tokens.typography)) {
    const style = core.semanticTypographyStyle(key);
    assert.equal(style.fontSize, token.size, `${key} size must equal the approved token size`);
    assert.ok(
      token.weight.includes(style.fontWeight),
      `${key} default weight ${style.fontWeight} must be one of the approved weights (${token.weight.join("/")})`,
    );
    assert.equal(
      style.fontWeight,
      token.weight[token.weight.length - 1],
      `${key} default weight must be the token's characteristic (heaviest) approved weight`,
    );
  }
  // Explicit approved weights resolve exactly.
  assert.deepEqual(core.semanticTypographyStyle("body", 400), { fontSize: 16, fontWeight: 400 });
  assert.deepEqual(core.semanticTypographyStyle("body", 500), { fontSize: 16, fontWeight: 500 });
  assert.deepEqual(core.semanticTypographyStyle("bodySmall", 400), {
    fontSize: 14,
    fontWeight: 400,
  });
  assert.deepEqual(core.semanticTypographyStyle("headline"), { fontSize: 18, fontWeight: 600 });
  assert.deepEqual(core.semanticTypographyStyle("title3"), { fontSize: 22, fontWeight: 700 });
  // Weights outside a token's approved set are rejected.
  assert.throws(() => core.semanticTypographyStyle("body", 600), /not approved/);
  assert.throws(() => core.semanticTypographyStyle("bodySmall", 700), /not approved/);
  assert.throws(() => core.semanticTypographyStyle("headline", 500), /not approved/);
  // The compiled helper itself must not inline raw typography literals.
  const compiled = readFileSync(join(OUT, "core.js"), "utf8");
  assert.ok(
    !RAW_FONT_SIZE.test(compiled),
    "compiled helper must derive fontSize from the token object, not a literal",
  );
  assert.ok(
    !RAW_FONT_WEIGHT.test(compiled),
    "compiled helper must derive fontWeight from the token object, not a literal",
  );
});

test("typography declarations surface only through the authorized helper module", () => {
  const files = primitiveSources();
  const indexSource = readText(INDEX);
  assert.ok(
    indexSource.includes('export * from "./core"'),
    "public boundary must export the core helper surface",
  );
  for (const file of files) {
    if (file === CORE_REL) continue; // authorized typography helper module
    const source = readText(file);
    assert.ok(
      !source.includes("fontSize") && !source.includes("fontWeight"),
      `${file} must route typography through semanticTypographyStyle()`,
    );
  }
});
