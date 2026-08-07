/**
 * MTS-003 contract: localization catalog boundary.
 *
 * Technical specification section 25 supports exactly `en` and `zh-HK`, and
 * CI must block missing keys in either locale. This contract loads the built
 * @misyra/localization catalogs and proves key parity between the two
 * locales, non-empty values, and English fallback availability.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { repoRoot } from "../toolchain/helpers.mjs";

/**
 * Import the built @misyra/localization public entry, building the workspace
 * first when the dist output is not present yet.
 *
 * @returns {Promise<any>} the localization public entry module
 */
async function loadLocalization() {
  const distEntry = join(repoRoot, "packages", "localization", "dist", "index.js");
  if (!existsSync(distEntry)) {
    execFileSync("pnpm", ["--filter", "@misyra/localization", "run", "build"], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: "pipe",
    });
  }
  assert.ok(existsSync(distEntry), "packages/localization produced no dist/index.js after build");
  return import(pathToFileURL(distEntry).href);
}

test("localization supports exactly en and zh-HK", async () => {
  const localization = await loadLocalization();
  assert.deepEqual(
    [...localization.supportedLocales].sort(),
    ["en", "zh-HK"],
    "supported locales must be exactly en and zh-HK",
  );
});

test("both catalogs expose identical key inventories", async () => {
  const { catalogs } = await loadLocalization();
  const englishKeys = Object.keys(catalogs.en).sort();
  const traditionalKeys = Object.keys(catalogs["zh-HK"]).sort();
  assert.ok(englishKeys.length > 0, "the English catalog must not be empty");
  assert.deepEqual(
    traditionalKeys,
    englishKeys,
    "zh-HK catalog must define every English key (CI blocks missing keys)",
  );
});

test("every catalog value is a non-empty string", async () => {
  const { catalogs, supportedLocales } = await loadLocalization();
  /** @type {string[]} */
  const offenders = [];
  for (const locale of supportedLocales) {
    for (const [key, value] of Object.entries(catalogs[locale])) {
      if (typeof value !== "string" || value.trim().length === 0) {
        offenders.push(`${locale}:${key}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `empty localization values found: ${offenders.join(", ")}`);
});

test("unsupported locales fall back to English", async () => {
  const localization = await loadLocalization();
  assert.equal(typeof localization.resolveCatalog, "function");
  const fallback = localization.resolveCatalog("fr");
  assert.deepEqual(fallback, localization.catalogs.en, "unknown locales must fall back to en");
  const traditional = localization.resolveCatalog("zh-HK");
  assert.deepEqual(traditional, localization.catalogs["zh-HK"]);
});
