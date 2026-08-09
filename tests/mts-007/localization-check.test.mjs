/**
 * MTS-007 contract: localization-completeness gate.
 *
 * Technical specification section 25: CI blocks missing keys in either
 * locale. The gate verifies that the English and zh-HK catalogs expose
 * exactly the same key inventory with non-empty values. The negative
 * contracts mutate throwaway copies of the real catalogs so the approved
 * source files are never touched by tests.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileExists, repoRoot } from "../toolchain/helpers.mjs";

const SCRIPT = "scripts/ci/localization-check.mjs";
const EN_CATALOG = "packages/localization/src/catalogs/en.ts";
const ZH_CATALOG = "packages/localization/src/catalogs/zh-hk.ts";

/**
 * Run the localization gate script and return its result.
 *
 * @param {string[]} args
 * @returns {import("node:child_process").SpawnSyncReturns<string>}
 */
function runScript(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

/**
 * Copy both catalogs into a throwaway directory, apply `mutate`, and return
 * the temp paths so the gate can be exercised against damaged catalogs
 * without touching the approved originals.
 *
 * @param {(enPath: string, zhPath: string) => void} mutate
 * @returns {{ dir: string; enPath: string; zhPath: string }}
 */
function withTempCatalogs(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "misyra-l10n-"));
  const enPath = join(dir, "en.ts");
  const zhPath = join(dir, "zh-hk.ts");
  copyFileSync(join(repoRoot, EN_CATALOG), enPath);
  copyFileSync(join(repoRoot, ZH_CATALOG), zhPath);
  mutate(enPath, zhPath);
  return { dir, enPath, zhPath };
}

test("the localization-completeness gate script exists", () => {
  assert.ok(fileExists(SCRIPT), "scripts/ci/localization-check.mjs is missing");
});

test("the approved English and zh-HK catalogs are key-complete", () => {
  const result = runScript([]);
  assert.equal(
    result.status,
    0,
    `catalogs must be key-complete:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});

test("a missing zh-HK key fails the gate", () => {
  const { dir, enPath, zhPath } = withTempCatalogs((_en, zh) => {
    const source = readFileSync(zh, "utf8");
    writeFileSync(zh, source.replace(/\s*"tabs\.calendar": "[^"]*",?/, ""));
  });
  try {
    const result = runScript([enPath, zhPath]);
    assert.notEqual(result.status, 0, "a missing zh-HK key must fail the gate");
    assert.ok(
      result.stdout.includes("tabs.calendar"),
      `output must name the missing key:\n${result.stdout}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an extra zh-HK key fails the gate", () => {
  const { dir, enPath, zhPath } = withTempCatalogs((_en, zh) => {
    const source = readFileSync(zh, "utf8");
    writeFileSync(zh, source.replace(/};/, `  "tabs.extra": "額外",\n};`));
  });
  try {
    const result = runScript([enPath, zhPath]);
    assert.notEqual(result.status, 0, "an extra zh-HK key must fail the gate");
    assert.ok(
      result.stdout.includes("tabs.extra"),
      `output must name the extra key:\n${result.stdout}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty zh-HK value fails the gate", () => {
  const { dir, enPath, zhPath } = withTempCatalogs((_en, zh) => {
    const source = readFileSync(zh, "utf8");
    writeFileSync(zh, source.replace('"tabs.settings": "設定"', '"tabs.settings": ""'));
  });
  try {
    const result = runScript([enPath, zhPath]);
    assert.notEqual(result.status, 0, "an empty zh-HK value must fail the gate");
    assert.ok(
      result.stdout.includes("tabs.settings"),
      `output must name the empty key:\n${result.stdout}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
