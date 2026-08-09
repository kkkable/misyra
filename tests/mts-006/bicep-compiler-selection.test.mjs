/**
 * MTS-006 — Bicep compiler selection/invocation consistency contract.
 *
 * The MTS-006 build contract advertises support for two toolchains: the
 * Azure CLI (`az bicep ...`) and the standalone Bicep CLI (`bicep ...`).
 * Compiler detection and compiler invocation must agree: when only the
 * standalone compiler is available, the compile path must invoke `bicep`
 * and must never attempt `az`.
 *
 * This contract proves that agreement deterministically in an isolated
 * sandbox PATH that contains a fake standalone `bicep` executable and no
 * `az` at all, so the proof never depends on the developer's real machine
 * toolchain and never requires installing any global tooling.
 *
 * @module tests/mts-006/bicep-compiler-selection
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, relative } from "node:path";
import { test } from "node:test";

import { repoRoot } from "../toolchain/helpers.mjs";

/** The MTS-006 suite whose compile path is under contract. */
const COMPILE_SUITE = relative(repoRoot, join(repoRoot, "tests", "mts-006", "bicep-skeleton.test.mjs"));

/**
 * Create an isolated sandbox whose PATH contains a fake standalone `bicep`
 * executable (recording every invocation to a marker file) and no `az` at
 * all. The sandbox therefore models exactly the scenario where standalone
 * Bicep is available while the Azure CLI is unavailable.
 *
 * @returns {{ root: string, path: string, marker: string }}
 */
function createCompilerSandbox() {
  const root = mkdtempSync(join(tmpdir(), "misyra-mts006-compiler-"));
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const marker = join(root, "bicep-invoked.marker");
  // The fake mimics the standalone Bicep CLI surface used by the compile
  // contract: `bicep --version` (detection), `bicep build <file> ...` and
  // `bicep build-params <file> ...` (compilation), writing a marker on every
  // invocation so the test can prove the standalone binary was really used.
  const fakeBicep =
    process.platform === "win32"
      ? `@echo off\r\nsetlocal\r\necho %*>> "${marker}"\r\nif "%~1"=="--version" echo Bicep CLI version 0.45.6 (fake)& exit /b 0\r\nif "%~1"=="build" echo {"fake":true}& exit /b 0\r\nif "%~1"=="build-params" echo {"fake":true}& exit /b 0\r\nexit /b 0\r\n`
      : `#!/bin/sh\nprintf '%s\\n' "$*" >> "${marker}"\ncase "$1" in\n  --version) echo "Bicep CLI version 0.45.6 (fake)" ;;\n  build|build-params) echo '{"fake":true}' ;;\nesac\nexit 0\n`;
  const fakePath = join(binDir, process.platform === "win32" ? "bicep.cmd" : "bicep");
  writeFileSync(fakePath, fakeBicep, { mode: 0o755 });
  // PATH contains only the sandbox bin directory (plus System32 so Windows
  // shell-based spawns behave). `az` lives outside this PATH, so the Azure
  // CLI is guaranteed unavailable inside the sandbox.
  const systemDir =
    process.platform === "win32"
      ? `${delimiter}${process.env.SystemRoot ?? "C:\\Windows"}\\System32`
      : "";
  return { root, path: `${binDir}${systemDir}`, marker };
}

test("the compile suite invokes standalone bicep (not az) when only standalone bicep is available", (t) => {
  const sandbox = createCompilerSandbox();
  t.after(() => rmSync(sandbox.root, { recursive: true, force: true }));

  /** @type {Record<string, string | undefined>} */
  const childEnv = { ...process.env, PATH: sandbox.path };
  // Windows environment names are case-insensitive; drop the native-case
  // duplicate so the sandbox PATH is the only PATH the child sees.
  delete childEnv.Path;
  // The outer run may itself be a `node --test` process, which sets
  // NODE_TEST_CONTEXT so nested `--test` invocations refuse to run files
  // ("recursively within a test file"). The sandbox child must behave like
  // a top-level test runner, so that marker is stripped.
  delete childEnv.NODE_TEST_CONTEXT;

  const child = spawnSync(process.execPath, ["--test", COMPILE_SUITE], {
    cwd: repoRoot,
    encoding: "utf8",
    env: childEnv,
    timeout: 120_000,
  });

  assert.equal(
    child.status,
    0,
    `the MTS-006 compile suite must pass using only the standalone bicep compiler (az unavailable). ` +
      `stdout:\n${child.stdout}\nstderr:\n${child.stderr}`,
  );
  assert.ok(
    existsSync(sandbox.marker),
    "the standalone bicep executable must actually have been invoked by the compile path",
  );
});
