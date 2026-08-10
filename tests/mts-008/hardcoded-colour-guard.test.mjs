/**
 * MTS-008 contract (correction round 2): forbidden hard-coded colour guard.
 *
 * The MTS-008 acceptance criteria require that "no screen contains
 * hard-coded visual constants outside approved exceptions" and the required
 * TDD evidence includes a "forbidden hard-coded colour lint/test". This
 * contract establishes that enforcement as a deterministic gate:
 *
 *   - the guard module `scripts/ci/hardcoded-color-check.mjs` scans product
 *     / mobile UI source for raw hex (`#RGB`/`#RRGGBB`/`#RRGGBBAA`) and
 *     `rgb(...)` / `rgba(...)` colour literals outside the design-token
 *     definition (packages/design-tokens is the definition and is not
 *     scanned; generated/build output such as `dist`, `.expo`, `.turbo` and
 *     `node_modules` is never scanned as product source);
 *   - only an exact, documented exception allowlist (file + line + literal
 *     value) may suppress a finding — the shipped list is empty and every
 *     exception must be declared explicitly;
 *   - the default repository gate scans `apps/mobile` and must currently be
 *     clean, proving the enforcement baseline on real product source.
 *
 * These contracts are intended to FAIL against the reviewed head bc0e357...
 * (the guard module does not exist yet) and go green once the guard is
 * implemented. No specification file is rewritten; fixtures are isolated
 * under tests/fixtures/mts-008/hardcoded-colour/.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { repoRoot } from "../toolchain/helpers.mjs";

const GUARD_ENTRY = join(repoRoot, "scripts", "ci", "hardcoded-color-check.mjs");
const FIXTURE_DIR = join(repoRoot, "tests", "fixtures", "mts-008", "hardcoded-colour");

/** @type {any} */ let cachedGuard;

/** @returns {Promise<any>} the guard module */
async function loadGuard() {
  if (cachedGuard === undefined) {
    cachedGuard = await import(pathToFileURL(GUARD_ENTRY).href);
  }
  return cachedGuard;
}

test("guard module exists and exposes the check contract", async () => {
  const guard = await loadGuard();
  assert.equal(
    typeof guard.checkHardcodedColors,
    "function",
    "checkHardcodedColors must be exported",
  );
  assert.ok(Array.isArray(guard.DEFAULT_EXCEPTIONS), "DEFAULT_EXCEPTIONS must be exported");
  assert.equal(
    guard.DEFAULT_EXCEPTIONS.length,
    0,
    "the shipped exception allowlist must be empty (every exception must be declared explicitly)",
  );
});

test("clean tokenized fixture produces no violations", async () => {
  const guard = await loadGuard();
  const file = join(FIXTURE_DIR, "clean-tokenized.tsx");
  const result = guard.checkHardcodedColors({ files: [file] });
  assert.deepEqual(result.violations, [], "tokenized source must have no hard-coded colours");
  assert.deepEqual(result.scanned, [file], "scanned files must be reported");
});

test("raw hex literal fixture is flagged with file, line and value", async () => {
  const guard = await loadGuard();
  const file = join(FIXTURE_DIR, "raw-hex.tsx");
  const result = guard.checkHardcodedColors({ files: [file] });
  assert.deepEqual(result.violations, [{ file, line: 1, value: "#FF00AA" }]);
});

test("raw rgb/rgba literal fixture is flagged with file, line and value", async () => {
  const guard = await loadGuard();
  const file = join(FIXTURE_DIR, "raw-rgb.tsx");
  const result = guard.checkHardcodedColors({ files: [file] });
  assert.deepEqual(result.violations, [
    { file, line: 1, value: "rgb(255, 0, 0)" },
    { file, line: 2, value: "rgba(0, 0, 0, 0.62)" },
  ]);
});

test("a raw literal is allowed only with an exact documented exception entry", async () => {
  const guard = await loadGuard();
  const file = join(FIXTURE_DIR, "documented-exception.tsx");

  const withoutException = guard.checkHardcodedColors({ files: [file] });
  assert.deepEqual(
    withoutException.violations,
    [{ file, line: 5, value: "#000000" }],
    "the literal must be flagged when no exception is declared",
  );

  const withException = guard.checkHardcodedColors({
    files: [file],
    exceptions: [
      {
        file,
        line: 5,
        value: "#000000",
        reason: "documented exception fixture for the guard contract",
      },
    ],
  });
  assert.deepEqual(withException.violations, [], "an exact documented exception must be honoured");
});

test("an exception entry does not leak to other files or lines", async () => {
  const guard = await loadGuard();
  const hexFile = join(FIXTURE_DIR, "raw-hex.tsx");
  const exceptionForOtherFile = guard.checkHardcodedColors({
    files: [hexFile],
    exceptions: [
      {
        file: join(FIXTURE_DIR, "documented-exception.tsx"),
        line: 1,
        value: "#FF00AA",
        reason: "wrong file",
      },
    ],
  });
  assert.deepEqual(exceptionForOtherFile.violations, [
    { file: hexFile, line: 1, value: "#FF00AA" },
  ]);

  const exceptionForOtherLine = guard.checkHardcodedColors({
    files: [hexFile],
    exceptions: [{ file: hexFile, line: 99, value: "#FF00AA", reason: "wrong line" }],
  });
  assert.deepEqual(exceptionForOtherLine.violations, [
    { file: hexFile, line: 1, value: "#FF00AA" },
  ]);
});

test("the default repository gate is clean on current product/mobile source", () => {
  const output = execFileSync(process.execPath, [GUARD_ENTRY], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.match(output, /clean/, `default gate must report clean; output: ${output}`);
});
