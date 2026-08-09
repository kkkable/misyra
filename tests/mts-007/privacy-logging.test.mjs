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

test("a safe log stays green when a sensitive identifier appears in unrelated nearby code", () => {
  // The log argument is a static literal; a sensitive-looking identifier
  // appears only in unrelated code after the call. The gate must evaluate
  // the actual log arguments, not an arbitrary fixed tail of the file.
  const dir = mkdtempSync(join(tmpdir(), "misyra-privacy-"));
  const fixture = join(dir, "safe-near-sensitive.mjs");
  writeFileSync(
    fixture,
    [
      "// Intentional privacy-gate fixture: the log argument is a static literal;",
      "// a sensitive-looking identifier appears only in unrelated code after the call.",
      "export function run(passwordPolicy) {",
      '  console.log("started");',
      "  return passwordPolicy;",
      "}",
      "",
    ].join("\n"),
  );
  try {
    const result = runScript([fixture]);
    assert.equal(
      result.status,
      0,
      `a safe log must pass even when unrelated code nearby mentions sensitive identifiers:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("template-interpolated sensitive values fail the gate", () => {
  // The sensitive value is an executable ${...} expression inside a template
  // literal and must be inspected, not stripped together with the static text.
  const dir = mkdtempSync(join(tmpdir(), "misyra-privacy-"));
  const fixture = join(dir, "template-interpolation.mjs");
  writeFileSync(
    fixture,
    [
      "// Intentional privacy-gate fixture: logging a template-interpolated",
      "// sensitive value must be rejected.",
      "export function logToken(user) {",
      "  console.log(`token ${user.token}`);",
      "}",
      "",
    ].join("\n"),
  );
  try {
    const result = runScript([fixture]);
    assert.notEqual(
      result.status,
      0,
      `logging a template-interpolated token must fail the gate:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("static prose mentioning environment or payload text passes the gate", () => {
  // Literal text is prose, not evaluation: mentioning process.env or
  // request.body inside a string must not trip the environment or
  // HTTP-payload rules.
  const dir = mkdtempSync(join(tmpdir(), "misyra-privacy-"));
  const fixture = join(dir, "static-mention.mjs");
  writeFileSync(
    fixture,
    [
      "// Intentional privacy-gate fixture: literal text is prose, not evaluation.",
      "export function explain() {",
      '  console.log("process.env and request.body are never evaluated here");',
      "}",
      "",
    ].join("\n"),
  );
  try {
    const result = runScript([fixture]);
    assert.equal(
      result.status,
      0,
      `static prose inside a literal must pass the gate:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a console call executed inside template interpolation fails the gate", () => {
  // ${...} regions are executable code, not static template text: a real
  // console.log executed inside an interpolation and logging a token must
  // be flagged, not skipped together with the surrounding static prose.
  const dir = mkdtempSync(join(tmpdir(), "misyra-privacy-"));
  const fixture = join(dir, "interpolation-executed-log.mjs");
  writeFileSync(
    fixture,
    [
      "// Intentional privacy-gate fixture: a real console call inside a",
      "// template interpolation must be flagged.",
      "export function render(user) {",
      "  const rendered = `${console.log(user.token)}`;",
      "  return rendered;",
      "}",
      "",
    ].join("\n"),
  );
  try {
    const result = runScript([fixture]);
    assert.notEqual(
      result.status,
      0,
      `a console.log executed inside template interpolation must fail the gate:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an HTTP payload log executed inside template interpolation fails the gate", () => {
  // Same rule for HTTP payloads: a console.error executed inside ${...}
  // and logging a request body must be flagged.
  const dir = mkdtempSync(join(tmpdir(), "misyra-privacy-"));
  const fixture = join(dir, "interpolation-http-payload.mjs");
  writeFileSync(
    fixture,
    [
      "// Intentional privacy-gate fixture: logging an HTTP payload inside a",
      "// template interpolation must be flagged.",
      "export function renderRequest(request) {",
      "  return render(`${console.error(request.body)}`);",
      "}",
      "",
    ].join("\n"),
  );
  try {
    const result = runScript([fixture]);
    assert.notEqual(
      result.status,
      0,
      `console.error executed inside template interpolation must fail the gate:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("console-looking static template text does not create a false positive", () => {
  // Static template text is prose, not evaluation: a console.log(...)
  // mention inside backticks with no interpolation must stay green.
  const dir = mkdtempSync(join(tmpdir(), "misyra-privacy-"));
  const fixture = join(dir, "static-template-prose.mjs");
  writeFileSync(
    fixture,
    [
      "// Intentional privacy-gate fixture: static template prose is not a",
      "// real console call.",
      "export function example() {",
      "  const message = `example: console.log(user.token)`;",
      "  return message;",
      "}",
      "",
    ].join("\n"),
  );
  try {
    const result = runScript([fixture]);
    assert.equal(
      result.status,
      0,
      `static template prose must pass the gate:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
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
