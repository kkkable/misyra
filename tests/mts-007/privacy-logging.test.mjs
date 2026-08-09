/**
 * MTS-007 contract: privacy/logging static gate.
 *
 * Technical specification section 28 requires privacy/logging checks on
 * every pull request. The gate flags logging of sensitive data, environment
 * variables, and HTTP request/response payloads. The committed fixtures
 * under tests/mts-007/fixtures/privacy contain only fake placeholders and
 * are skipped by the default repository-wide scan; the tests exercise them
 * through explicit paths.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileExists, repoRoot } from "../toolchain/helpers.mjs";

const SCRIPT = "scripts/ci/privacy-logging-check.mjs";
const BAD_LOGGING = "tests/mts-007/fixtures/privacy/bad-logging.mjs";
const ENV_LOGGING = "tests/mts-007/fixtures/privacy/env-logging.mjs";
const CLEAN = "tests/mts-007/fixtures/privacy/clean.mjs";

/**
 * Run the privacy gate script and return its result.
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

test("the privacy/logging gate script exists", () => {
  assert.ok(fileExists(SCRIPT), "scripts/ci/privacy-logging-check.mjs is missing");
});

test("logging sensitive data fails the gate", () => {
  const result = runScript([BAD_LOGGING]);
  assert.notEqual(result.status, 0, "logging a password field must fail the gate");
  assert.ok(
    result.stdout.includes(BAD_LOGGING),
    `output must name the offending file:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});

test("logging environment variables fails the gate", () => {
  const result = runScript([ENV_LOGGING]);
  assert.notEqual(result.status, 0, "logging an environment variable must fail the gate");
  assert.ok(
    result.stdout.includes(ENV_LOGGING),
    `output must name the offending file:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});

test("logging HTTP request payloads fails the gate", () => {
  // The violating fixture is materialized in a throwaway temp directory so
  // the repository tree is never modified by the test run.
  const dir = mkdtempSync(join(tmpdir(), "misyra-privacy-"));
  const fixture = join(dir, "request-body-logging.mjs");
  writeFileSync(
    fixture,
    [
      "// Intentional privacy-gate fixture: logging an HTTP request body must be flagged.",
      "export function logRequest(request) {",
      '  console.log("request", request.body);',
      "}",
      "",
    ].join("\n"),
  );
  try {
    const result = runScript([fixture]);
    assert.notEqual(result.status, 0, "logging an HTTP request body must fail the gate");
    assert.ok(
      result.stdout.includes("request-body-logging.mjs"),
      `output must name the offending file:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("clean source passes the privacy gate", () => {
  const result = runScript([CLEAN]);
  assert.equal(
    result.status,
    0,
    `clean source must pass the gate:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});
