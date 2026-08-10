/**
 * MTS-008 contract: typed light/dark design tokens (technical specification §6).
 *
 * Replaces the MTS-003 placeholder shell with the real typed token contract:
 *   - §6.3 space scale,
 *   - §6.4 radius scale,
 *   - §6.5 semantic typography inventory and approved size/weight values,
 *   - §6.6 light palette,
 *   - §6.7 dark palette,
 *   - light/dark semantic-key parity,
 *   - public-entry importability,
 *   - no framework/provider dependency/import,
 *   - no excluded red missed-state token or other excluded mission status.
 *
 * These contracts are intended to FAIL against the current MTS-003 placeholder
 * shell (which exposes no token families) and go green once the real tokens are
 * implemented.
 *
 * The package must remain pure TypeScript and platform/framework neutral.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { repoRoot, walkFiles } from "../toolchain/helpers.mjs";
import { runTsc } from "@misyra/test-config/fixture-runner";

const PACKAGE_DIR = join(repoRoot, "packages", "design-tokens");
const DIST_ENTRY = join(PACKAGE_DIR, "dist", "index.js");

/**
 * Materialize the built public entry in a fresh checkout when dist is absent,
 * mirroring the other workspace contract tests. The package build is pure
 * `tsc` (no network, no toolchain beyond the already-installed compiler).
 */
function ensureBuilt() {
  if (!existsSync(DIST_ENTRY)) {
    execFileSync(process.execPath, [join(PACKAGE_DIR, "scripts", "build.mjs")], {
      cwd: PACKAGE_DIR,
      encoding: "utf8",
    });
  }
}

/** @type {any} */ let cachedTokens;

/**
 * Load the built public entry once per process.
 *
 * @returns {Promise<any>} the design-tokens public entry module
 */
async function loadTokens() {
  if (cachedTokens === undefined) {
    ensureBuilt();
    cachedTokens = await import(pathToFileURL(DIST_ENTRY).href);
  }
  return cachedTokens;
}

/** Exact §6.3 4-point-grid spacing scale. */
const EXPECTED_SPACE = {
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
};

/** Exact §6.4 radius scale. */
const EXPECTED_RADIUS = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

/**
 * Exact §6.5 semantic typography inventory. Each token's `weight` is the
 * approved weight set for that token; dual-weight tokens (e.g. 400/500)
 * list both approved values.
 */
const EXPECTED_TYPOGRAPHY = {
  caption2: { size: 11, weight: [500] },
  caption1: { size: 12, weight: [500] },
  bodySmall: { size: 14, weight: [400, 500] },
  body: { size: 16, weight: [400, 500] },
  headline: { size: 18, weight: [600] },
  title3: { size: 22, weight: [700] },
  title2: { size: 28, weight: [700] },
  title1: { size: 34, weight: [700] },
};

/** Exact §6.6 light-mode palette. */
const EXPECTED_LIGHT = {
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
};

/** Exact §6.7 dark-mode palette. */
const EXPECTED_DARK = {
  canvas: "#11111A",
  surface: "#191925",
  surfaceRaised: "#222231",
  surfaceMuted: "#242434",
  textPrimary: "#F7F5FF",
  textSecondary: "#B9B5C8",
  textTertiary: "#8E899F",
  border: "#343247",
  divider: "#2A2939",
  primary: "#6D3DFF",
  primaryPressed: "#724AF2",
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
};

/**
 * Framework/provider import categories forbidden inside the design-tokens
 * package by the technical specification architecture boundary (sections 5.1
 * and 6). Expressed as specifier prefixes.
 */
const FORBIDDEN = {
  react: ["react", "react/", "react-native", "react-native/"],
  expo: ["expo", "expo/", "expo-"],
  fastify: ["fastify", "fastify/", "@fastify/"],
  database: [
    "drizzle-orm",
    "drizzle-orm/",
    "postgres",
    "pg",
    "pg/",
    "expo-sqlite",
    "better-sqlite3",
    "@neondatabase/",
  ],
  azure: ["@azure/", "@azure-"],
  google: ["@google/", "@google-cloud/", "googleapis", "google-auth-library", "@google-genai"],
  apple: ["@apple/", "apple-auth-kit", "eventkit"],
  ai: ["openai", "openai/", "@openai/", "@anthropic-ai/", "@ai-sdk/", "google-genai"],
};

/** Approved mission/status semantic color keys that must exist in both palettes. */
const APPROVED_STATUS_KEYS = [
  "verified",
  "verifiedSoft",
  "late",
  "lateSoft",
  "privateState",
  "privateSoft",
  "destructive",
  "destructiveSoft",
  "external",
  "externalSoft",
];

test("space scale matches the approved §6.3 grid", async () => {
  const mod = await loadTokens();
  assert.deepEqual(mod.space, EXPECTED_SPACE, "space must match the approved 4-point grid");
});

test("radius scale matches the approved §6.4 shape tokens", async () => {
  const mod = await loadTokens();
  assert.deepEqual(mod.radius, EXPECTED_RADIUS, "radius must match the approved scale");
});

test("typography semantic inventory and values match §6.5", async () => {
  const mod = await loadTokens();
  assert.deepEqual(mod.typography, EXPECTED_TYPOGRAPHY, "typography must match §6.5");
});

test("lightColors palette matches the approved §6.6 values", async () => {
  const mod = await loadTokens();
  assert.deepEqual(mod.lightColors, EXPECTED_LIGHT, "lightColors must match §6.6 exactly");
});

test("darkColors palette matches the approved §6.7 values", async () => {
  const mod = await loadTokens();
  assert.deepEqual(mod.darkColors, EXPECTED_DARK, "darkColors must match §6.7 exactly");
});

test("light/dark semantic-key parity", async () => {
  const mod = await loadTokens();
  assert.ok(mod.lightColors, "lightColors must be defined");
  assert.ok(mod.darkColors, "darkColors must be defined");
  assert.deepEqual(
    Object.keys(mod.lightColors),
    Object.keys(mod.darkColors),
    "light and dark palettes must expose the same semantic keys",
  );
});

test("public entry is importable and exposes every token family", async () => {
  const mod = await loadTokens();
  for (const family of ["space", "radius", "typography", "lightColors", "darkColors"]) {
    assert.ok(family in mod, `public entry must export ${family}`);
  }
});

test("exported ColorValue accepts approved values from both palettes via the public type surface", () => {
  ensureBuilt();
  const result = runTsc("tests/fixtures/mts-008/tsconfig.color-value-fixture.json");
  assert.equal(
    result.code,
    0,
    `the public ColorValue type must accept approved light AND dark values; tsc output:\n${result.output}`,
  );
});

test("design-tokens introduces no framework/provider dependency or import", () => {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8"));
  const deps = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
  for (const name of Object.keys(deps)) {
    assert.ok(
      !isForbiddenSpecifier(name),
      `forbidden dependency "${name}" declared by @misyra/design-tokens`,
    );
  }

  const sourceFiles = walkFiles(join(PACKAGE_DIR, "src"), (entry) => entry.endsWith(".ts"));
  for (const rel of sourceFiles) {
    const text = readFileSync(join(repoRoot, rel), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!/(^|\s)(from\s+["']|import\s*\(|require\()/.test(line)) continue;
      const specifier = (line.match(/["']([^"']+)["']/) ?? [])[1];
      if (!specifier) continue;
      assert.ok(!isForbiddenSpecifier(specifier), `forbidden import "${specifier}" in ${rel}`);
    }
  }
});

test("no red missed-state token or other excluded mission status is introduced", async () => {
  const mod = await loadTokens();
  assert.ok(mod.lightColors, "lightColors must be defined");
  assert.ok(mod.darkColors, "darkColors must be defined");
  for (const palette of [mod.lightColors, mod.darkColors]) {
    for (const key of Object.keys(palette)) {
      assert.ok(!/missed/i.test(key), `excluded missed-state token "${key}" must not exist`);
    }
  }
  for (const key of APPROVED_STATUS_KEYS) {
    assert.ok(key in mod.lightColors, `light palette missing approved status key "${key}"`);
    assert.ok(key in mod.darkColors, `dark palette missing approved status key "${key}"`);
  }
});

/**
 * True when a specifier resolves to a forbidden framework/provider category.
 *
 * @param {string} specifier
 * @returns {boolean}
 */
function isForbiddenSpecifier(specifier) {
  for (const group of Object.values(FORBIDDEN)) {
    for (const prefix of group) {
      if (specifier.startsWith(prefix)) return true;
    }
  }
  return false;
}
