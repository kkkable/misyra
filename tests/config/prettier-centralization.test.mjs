/**
 * MTS-002 contract: centralized Prettier policy.
 *
 * The formatting policy must live in the shared @misyra/prettier-config
 * package, the root must reference it instead of carrying its own rules, and
 * Prettier itself must resolve exactly that shared policy (deterministic
 * formatting on Windows and Linux).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import {
  fileExists,
  readJson,
  readText,
  relativePosix,
  repoRoot,
  workspaceDirs,
} from "../toolchain/helpers.mjs";
import { runTool } from "@misyra/test-config/fixture-runner";

test("the root prettier configuration references the shared package", () => {
  assert.ok(fileExists(".prettierrc.json"), "expected .prettierrc.json at the repository root");
  const rootConfig = readJson(".prettierrc.json");
  const reference = JSON.stringify(rootConfig);
  assert.ok(
    reference.includes("@misyra/prettier-config"),
    `root prettier config must delegate to @misyra/prettier-config, got: ${reference}`,
  );
  assert.ok(
    typeof rootConfig === "string" ||
      (!("printWidth" in rootConfig) && !("endOfLine" in rootConfig)),
    "root prettier config must not duplicate formatting rules locally",
  );
});

test("the shared prettier package preserves the approved formatting policy", () => {
  const dir = workspaceDirs().find((candidate) => candidate.endsWith("prettier-config"));
  assert.ok(dir, "workspace package is missing: @misyra/prettier-config");
  const manifest = readJson(`${relativePosix(dir)}/package.json`);
  const target = /** @type {string} */ (manifest.main);
  assert.equal(typeof target, "string", "@misyra/prettier-config must declare main");
  const policy = readText(`${relativePosix(dir)}/${target.replace(/^\.\//, "")}`);
  assert.match(policy, /endOfLine:\s*"lf"/, "shared policy must keep LF line endings");
  assert.match(policy, /printWidth:\s*100/, "shared policy must keep the approved print width");
  assert.match(policy, /trailingComma:\s*"all"/, "shared policy must keep trailing commas");
});

test("prettier resolves the shared configuration for repository files", async () => {
  const found = runTool("prettier", ["--find-config-path", "README.md"]);
  assert.equal(found.code, 0, `prettier must resolve a config, got: ${found.output}`);
  // Prettier reports the root delegating rc file, so compare what it resolves
  // at runtime against the shared package policy itself.
  const prettier = await import("prettier");
  const resolved = await prettier.resolveConfig(join(repoRoot, "README.md"));
  assert.ok(resolved, "prettier must resolve configuration content for README.md");
  const requireFromRoot = createRequire(join(repoRoot, "noop.js"));
  const shared = requireFromRoot("./packages/prettier-config");
  assert.deepEqual(
    resolved,
    shared,
    "prettier must resolve exactly the shared @misyra/prettier-config policy",
  );
});

test("format:check remains deterministic against the shared policy", () => {
  const result = runTool("prettier", ["--check", "README.md"]);
  assert.equal(result.code, 0, `README.md must satisfy the shared policy: ${result.output}`);
});
