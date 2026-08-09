/**
 * MTS-006 — Bicep compiler selection/invocation consistency contract.
 *
 * The MTS-006 build contract advertises support for two toolchains: the
 * Azure CLI (`az bicep ...`) and the standalone Bicep CLI (`bicep ...`).
 * The two toolchains use different, documented argument shapes:
 *
 * - Azure CLI:      `az bicep build --file <file>`, `az bicep build-params --file <file>`
 * - standalone:     `bicep build <file>`,          `bicep build-params <file>`
 *
 * (Microsoft reference: https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/bicep-cli)
 *
 * Compiler detection and compiler invocation must agree: when only the
 * standalone compiler is available, the compile path must invoke `bicep`
 * with the standalone positional-file shape and must never attempt `az`
 * or the Azure-CLI-only `--file` syntax.
 *
 * These contracts prove that agreement deterministically in isolated
 * sandbox PATHs containing a fake compiler executable and no real machine
 * toolchain, so the proof never depends on the developer's machine and
 * never requires installing any global tooling.
 *
 * @module tests/mts-006/bicep-compiler-selection
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, relative } from "node:path";
import { test } from "node:test";

import { repoRoot } from "../toolchain/helpers.mjs";

/** The MTS-006 suite whose compile path is under contract. */
const COMPILE_SUITE = relative(
  repoRoot,
  join(repoRoot, "tests", "mts-006", "bicep-skeleton.test.mjs"),
);

/**
 * Create an isolated sandbox whose PATH contains exactly one fake compiler
 * executable (recording every invocation to a marker file) and nothing
 * else. The sandbox therefore models exactly the scenario named by `kind`:
 *
 * - `"standalone"`: standalone `bicep` available, `az` unavailable;
 * - `"az"`:         Azure CLI available, standalone `bicep` unavailable.
 *
 * The fake executables enforce the documented command shape of their
 * toolchain and reject the other toolchain's shape, so any detection/
 * invocation mismatch inside the compile suite fails the child run:
 *
 * - fake standalone `bicep` accepts `--version`, `build <file>`,
 *   `build-params <file>` (positional file arguments) and rejects any
 *   invocation containing the Azure-CLI-only `--file` syntax;
 * - fake `az` accepts `bicep version`, `bicep build --file <path>`,
 *   `bicep build-params --file <path>` and rejects positional-file shapes.
 *
 * @param {"standalone" | "az"} kind - Which compiler the sandbox provides.
 * @returns {{ root: string, path: string, marker: string }}
 */
function createCompilerSandbox(kind) {
  const root = mkdtempSync(join(tmpdir(), `misyra-mts006-compiler-${kind}-`));
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const marker = join(root, `${kind}-invoked.marker`);
  const isWin = process.platform === "win32";

  const standaloneWin = `@echo off\r\nsetlocal\r\necho %*>> "${marker}"\r\nif "%~1"=="--version" echo Bicep CLI version 0.45.6 (fake)& exit /b 0\r\nif not "%~1"=="build" if not "%~1"=="build-params" (echo unexpected standalone bicep invocation: %* >&2 & exit /b 1)\r\necho %* | findstr /C:"--file" >nul\r\nif not errorlevel 1 (echo standalone bicep does not accept --file; use a positional file argument >&2 & exit /b 1)\r\nif "%~2"=="" (echo standalone bicep requires a positional file argument >&2 & exit /b 1)\r\nset "arg2=%~2"\r\nif "%arg2:~0,2%"=="--" (echo standalone bicep requires a positional file argument >&2 & exit /b 1)\r\necho {"fake":true}\r\nexit /b 0\r\n`;
  const standalonePosix = `#!/bin/sh\nprintf '%s\\n' "$*" >> "${marker}"\ncase "$1" in\n  --version) echo "Bicep CLI version 0.45.6 (fake)"; exit 0 ;;\n  build|build-params) ;;\n  *) echo "unexpected standalone bicep invocation: $*" >&2; exit 1 ;;\nesac\ncase "$*" in\n  *--file*) echo "standalone bicep does not accept --file; use a positional file argument" >&2; exit 1 ;;\nesac\nif [ -z "$2" ] || [ "\${2#--}" != "$2" ]; then\n  echo "standalone bicep requires a positional file argument: $*" >&2\n  exit 1\nfi\necho '{"fake":true}'\nexit 0\n`;

  const azWin = `@echo off\r\nsetlocal\r\necho %*>> "${marker}"\r\nif not "%~1"=="bicep" (echo unexpected az invocation: %* >&2 & exit /b 1)\r\nif "%~2"=="version" echo Bicep CLI version 0.45.6 (fake)& exit /b 0\r\nif not "%~2"=="build" if not "%~2"=="build-params" (echo unexpected az bicep invocation: %* >&2 & exit /b 1)\r\nif not "%~3"=="--file" (echo az bicep %~2 requires --file <path>; got: %* >&2 & exit /b 1)\r\nif "%~4"=="" (echo az bicep %~2 requires --file <path>; got: %* >&2 & exit /b 1)\r\necho {"fake":true}\r\nexit /b 0\r\n`;
  const azPosix = `#!/bin/sh\nprintf '%s\\n' "$*" >> "${marker}"\n[ "$1" = "bicep" ] || { echo "unexpected az invocation: $*" >&2; exit 1; }\nif [ "$2" = "version" ]; then echo "Bicep CLI version 0.45.6 (fake)"; exit 0; fi\ncase "$2" in build|build-params) ;; *) echo "unexpected az bicep invocation: $*" >&2; exit 1 ;; esac\n[ "$3" = "--file" ] || { echo "az bicep $2 requires --file <path>; got: $*" >&2; exit 1; }\n[ -n "$4" ] || { echo "az bicep $2 requires --file <path>; got: $*" >&2; exit 1; }\necho '{"fake":true}'\nexit 0\n`;

  const script =
    kind === "standalone" ? (isWin ? standaloneWin : standalonePosix) : isWin ? azWin : azPosix;
  const fileName =
    kind === "standalone" ? (isWin ? "bicep.cmd" : "bicep") : isWin ? "az.cmd" : "az";
  writeFileSync(join(binDir, fileName), script, { mode: 0o755 });
  // PATH contains only the sandbox bin directory (plus System32 so Windows
  // shell-based spawns behave). The other compiler lives outside this PATH,
  // so it is guaranteed unavailable inside the sandbox.
  const systemDir = isWin ? `${delimiter}${process.env.SystemRoot ?? "C:\\Windows"}\\System32` : "";
  return { root, path: `${binDir}${systemDir}`, marker };
}

/**
 * Run the MTS-006 compile suite as a child process whose PATH is the
 * sandbox PATH, so the compile path can only see the fake compiler.
 *
 * @param {import("node:test").TestContext} t
 * @param {{ root: string, path: string, marker: string }} sandbox
 * @returns {import("node:child_process").SpawnSyncReturns<string>}
 */
function runCompileSuiteInSandbox(t, sandbox) {
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
  return spawnSync(process.execPath, ["--test", COMPILE_SUITE], {
    cwd: repoRoot,
    encoding: "utf8",
    env: childEnv,
    timeout: 120_000,
  });
}

test("the compile suite invokes standalone bicep with positional file arguments when only standalone bicep is available", (t) => {
  const sandbox = createCompilerSandbox("standalone");
  const child = runCompileSuiteInSandbox(t, sandbox);

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
  const invocations = readFileSync(sandbox.marker, "utf8");
  assert.ok(
    !invocations.includes("--file"),
    `standalone bicep must never receive the Azure-CLI-only --file syntax. Invocations:\n${invocations}`,
  );
  assert.match(
    invocations,
    /\bbuild\s+\S+\.bicep\b/,
    `standalone bicep build must be invoked with a positional .bicep file argument. Invocations:\n${invocations}`,
  );
  assert.match(
    invocations,
    /\bbuild-params\s+\S+\.bicepparam\b/,
    `standalone bicep build-params must be invoked with a positional .bicepparam file argument. Invocations:\n${invocations}`,
  );
});

test("the compile suite keeps az bicep --file syntax when only the Azure CLI is available", (t) => {
  const sandbox = createCompilerSandbox("az");
  const child = runCompileSuiteInSandbox(t, sandbox);

  assert.equal(
    child.status,
    0,
    `the MTS-006 compile suite must pass using only the Azure CLI compiler (standalone bicep unavailable). ` +
      `stdout:\n${child.stdout}\nstderr:\n${child.stderr}`,
  );
  assert.ok(
    existsSync(sandbox.marker),
    "the az executable must actually have been invoked by the compile path",
  );
  const invocations = readFileSync(sandbox.marker, "utf8");
  assert.match(
    invocations,
    /\bbicep build --file \S+\.bicep\b/,
    `az bicep mode must retain --file <path> syntax. Invocations:\n${invocations}`,
  );
  assert.match(
    invocations,
    /\bbicep build-params --file \S+\.bicepparam\b/,
    `az bicep mode must retain --file <path> syntax for parameter shapes. Invocations:\n${invocations}`,
  );
});
