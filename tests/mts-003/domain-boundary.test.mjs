/**
 * MTS-003 contract: domain boundary architecture test.
 *
 * `packages/domain` must remain pure TypeScript. Technical specification
 * section 5.1 forbids React Native, Fastify, database, Azure, Google, Apple,
 * and AI/provider imports inside the domain package. This test inspects the
 * real domain sources and manifest instead of relying on comments.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readJson, repoRoot, walkFiles } from "../toolchain/helpers.mjs";
import { readFile } from "node:fs/promises";

/**
 * Forbidden import categories named in the technical specification, expressed
 * as specifier prefixes. A domain source importing any of these violates the
 * architecture boundary.
 *
 * @type {Record<string, readonly string[]>}
 */
const FORBIDDEN_CATEGORIES = {
  react: ["react", "react/", "react-native", "react-native/"],
  expo: ["expo", "expo-", "expo/"],
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
  azure: ["@azure/", "azure-"],
  google: ["@google/", "@google-cloud/", "googleapis", "google-auth-library"],
  apple: ["@apple/", "apple-auth-kit", "eventkit"],
  ai: ["openai", "openai/", "@openai/", "@anthropic-ai/", "anthropic", "@ai-sdk/", "google-genai"],
};

/**
 * @param {string} specifier
 * @returns {string | undefined} the category name when forbidden
 */
function forbiddenCategory(specifier) {
  for (const [category, prefixes] of Object.entries(FORBIDDEN_CATEGORIES)) {
    for (const prefix of prefixes) {
      const exact = !prefix.endsWith("/") && !prefix.endsWith("-");
      const matches = exact ? specifier === prefix : specifier.startsWith(prefix);
      if (matches) return category;
    }
  }
  return undefined;
}

const IMPORT_SPECIFIER =
  /(?:import\s[^"']*?from\s*|import\s*\(\s*|export\s[^"']*?from\s*|require\s*\(\s*)["']([^"']+)["']/g;

test("packages/domain exists with TypeScript sources", () => {
  assert.ok(
    existsSync(join(repoRoot, "packages", "domain", "package.json")),
    "packages/domain is missing its manifest",
  );
  const sources = walkFiles(join(repoRoot, "packages", "domain"), (name) =>
    /\.(ts|tsx)$/.test(name),
  );
  assert.ok(sources.length > 0, "packages/domain must contain TypeScript sources");
});

test("packages/domain has no framework or provider imports", async () => {
  const domainDir = join(repoRoot, "packages", "domain");
  const sources = walkFiles(domainDir, (name) => /\.(ts|tsx|js|mjs|cjs)$/.test(name));
  /** @type {string[]} */
  const violations = [];
  for (const relative of sources) {
    const text = await readFile(join(repoRoot, relative), "utf8");
    for (const match of text.matchAll(IMPORT_SPECIFIER)) {
      const specifier = String(match[1]);
      if (specifier.startsWith(".")) continue;
      const category = forbiddenCategory(specifier);
      if (category) violations.push(`${relative}: ${category} import "${specifier}"`);
    }
  }
  assert.deepEqual(violations, [], `domain boundary violated:\n${violations.join("\n")}`);
});

test("packages/domain declares no framework or provider dependencies", () => {
  const manifest = readJson("packages/domain/package.json");
  /** @type {string[]} */
  const violations = [];
  for (const block of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = /** @type {Record<string, string> | undefined} */ (manifest[block]);
    for (const name of Object.keys(deps ?? {})) {
      const category = forbiddenCategory(name);
      if (category) violations.push(`${block}.${name} (${category})`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `domain manifest depends on forbidden frameworks/providers: ${violations.join(", ")}`,
  );
});
