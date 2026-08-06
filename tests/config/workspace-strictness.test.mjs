/**
 * MTS-002 contract: TypeScript strictness inheritance.
 *
 * Every workspace with TypeScript sources must extend the approved shared
 * configuration (@misyra/typescript-config/strict-base.json) and may not
 * disable required strict options. The intentional strict-violation fixture
 * must fail compilation with the expected diagnostic, proving the shared
 * configuration is genuinely strict.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readJson, relativePosix, repoRoot, workspaceDirs } from "../toolchain/helpers.mjs";
import { runTsc } from "@misyra/test-config/fixture-runner";

const SHARED_CONFIG = "@misyra/typescript-config/strict-base.json";
const FORBIDDEN_OVERRIDES = [
  "strict",
  "noImplicitAny",
  "strictNullChecks",
  "noFallthroughCasesInSwitch",
  "noUnusedLocals",
  "noUnusedParameters",
];

/**
 * @param {string} workspaceDir
 */
function hasTypeScriptSources(workspaceDir) {
  const src = join(workspaceDir, "src");
  if (!existsSync(src)) return false;
  return readdirSync(src, { recursive: true }).some((entry) => String(entry).endsWith(".ts"));
}

test("the shared strict base configuration exists in @misyra/typescript-config", () => {
  const dir = workspaceDirs().find((candidate) => candidate.endsWith("typescript-config"));
  assert.ok(dir, "workspace package is missing: @misyra/typescript-config");
  assert.ok(
    existsSync(join(dir, "strict-base.json")),
    "strict-base.json is missing from @misyra/typescript-config",
  );
  const base = readJson(`${relativePosix(dir)}/strict-base.json`);
  const options = /** @type {Record<string, unknown>} */ (base.compilerOptions ?? {});
  assert.equal(options.strict, true, "shared base must enable strict");
});

test("every TypeScript workspace extends the approved shared configuration", () => {
  const typed = workspaceDirs().filter((dir) => hasTypeScriptSources(dir));
  assert.ok(typed.length > 0, "at least one TypeScript workspace must exist");
  for (const dir of typed) {
    const tsconfigPath = join(dir, "tsconfig.json");
    assert.ok(existsSync(tsconfigPath), `missing tsconfig.json in ${relativePosix(dir)}`);
    const local = readJson(`${relativePosix(dir)}/tsconfig.json`);
    assert.equal(
      local.extends,
      SHARED_CONFIG,
      `${relativePosix(dir)} must extend ${SHARED_CONFIG}`,
    );
  }
});

test("no workspace disables required strict options", () => {
  for (const dir of workspaceDirs()) {
    const tsconfigPath = join(dir, "tsconfig.json");
    if (!existsSync(tsconfigPath)) continue;
    const local = readJson(`${relativePosix(dir)}/tsconfig.json`);
    const options = /** @type {Record<string, unknown>} */ (local.compilerOptions ?? {});
    for (const option of FORBIDDEN_OVERRIDES) {
      assert.ok(!(option in options), `${relativePosix(dir)} must not override ${option} locally`);
    }
  }
});

test("the strict fixture fails with the expected TS7006 diagnostic", () => {
  const result = runTsc("tests/fixtures/mts-002/tsconfig.strict-fixture.json");
  assert.notEqual(result.code, 0, "strict fixture compilation must fail");
  assert.match(
    result.output,
    /TS7006/,
    `expected the TS7006 implicit-any diagnostic, got: ${result.output.slice(0, 500)}`,
  );
  assert.match(result.output, /strict-violation\.ts/, "diagnostic must come from the fixture");
});

test("the shared strict base is reachable from the repository root", () => {
  assert.ok(
    existsSync(join(repoRoot, "node_modules", "@misyra", "typescript-config", "strict-base.json")),
    "node_modules link to @misyra/typescript-config is missing (run pnpm install)",
  );
});
