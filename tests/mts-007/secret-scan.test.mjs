/**
 * MTS-007 contract: deterministic secret-scan gate.
 *
 * The gate must fail on real secret-like material, pass on clean material,
 * and never print matched secret values (only file paths and rule names).
 * The fixtures directory tests/mts-007/fixtures/secrets contains documented
 * fake material used only to prove detection; the gate skips it in default
 * repository-wide mode, and the tests exercise it through explicit paths.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileExists, repoRoot } from "../toolchain/helpers.mjs";

const SCRIPT = "scripts/ci/secret-scan.mjs";
const FIXTURES = "tests/mts-007/fixtures/secrets";
const CLEAN = "tests/mts-007/fixtures/clean";

const FIXTURE_FILES = [
  "aws-access-key.txt",
  "azure-connection-string.txt",
  "github-pat.txt",
  "private-key.txt",
  "generic-password.txt",
  "jwt.txt",
];

/**
 * Run the secret-scan gate script and return its result.
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

test("the secret-scan gate script exists", () => {
  assert.ok(fileExists(SCRIPT), "scripts/ci/secret-scan.mjs is missing");
});

test("the secret-scan gate detects every documented secret-like fixture", () => {
  const result = runScript([FIXTURES]);
  assert.notEqual(result.status, 0, "scanning the secrets fixture directory must fail the gate");
  for (const name of FIXTURE_FILES) {
    assert.ok(
      result.stdout.includes(name),
      `expected ${name} to be flagged:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
});

test("the secret-scan gate passes on clean material", () => {
  const result = runScript([CLEAN]);
  assert.equal(
    result.status,
    0,
    `clean material must pass the gate:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});

test("the secret-scan gate never prints matched secret values", () => {
  const result = runScript([FIXTURES]);
  // Read the fixture values from disk so the test source itself carries no
  // secret-like literals.
  const fixtureLines = [];
  for (const name of FIXTURE_FILES) {
    const text = readFileSync(`${repoRoot}/${FIXTURES}/${name}`, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length > 0) fixtureLines.push(trimmed);
    }
  }
  assert.ok(fixtureLines.length > 0, "fixture files must contain content");
  for (const line of fixtureLines) {
    assert.ok(
      !result.stdout.includes(line),
      `scan output must not leak the fixture value: ${line}`,
    );
  }
});
