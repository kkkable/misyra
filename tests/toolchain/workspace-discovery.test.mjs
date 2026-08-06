/**
 * MTS-001 contract: workspace discovery.
 *
 * Verifies that pnpm owns workspace discovery, that every declared workspace
 * is a valid package, and that no npm or Yarn artifacts compete with
 * pnpm-lock.yaml.
 */
import assert from "node:assert/strict";
import { basename, join } from "node:path";
import { test } from "node:test";
import {
  fileExists,
  parseWorkspacePackages,
  readJson,
  readText,
  repoRoot,
  run,
  walkFiles,
  workspaceDirs,
} from "./helpers.mjs";

test("pnpm-workspace.yaml declares at least one workspace glob", () => {
  const patterns = parseWorkspacePackages(readText("pnpm-workspace.yaml"));
  assert.ok(patterns.length > 0, "workspace package globs are missing");
  for (const pattern of patterns) {
    assert.match(pattern, /^[\w-]+\/\*$/, `unsupported workspace glob: ${pattern}`);
  }
});

test("declared workspace directories each contain a valid package.json", () => {
  const dirs = workspaceDirs();
  assert.ok(dirs.length > 0, "at least one workspace package must be discoverable");
  for (const dir of dirs) {
    const manifest = readJson(`${dir.slice(repoRoot.length + 1).replaceAll("\\", "/")}/package.json`);
    assert.match(manifest.name, /^@misyra\//, `workspace package must use the @misyra scope: ${dir}`);
    assert.equal(typeof manifest.version, "string", `workspace package must declare a version: ${dir}`);
    assert.equal(manifest.private, true, `workspace package must be private: ${dir}`);
    assert.equal(basename(dir), manifest.name.split("/")[1], `directory name must match package name: ${dir}`);
  }
});

test("the toolchain fixture workspace is discoverable through pnpm", () => {
  const dirs = workspaceDirs().map((dir) => basename(dir));
  assert.ok(dirs.includes("toolchain-fixture"), "expected packages/toolchain-fixture to be discoverable");
});

test("exactly one lockfile exists: pnpm-lock.yaml at the repository root", () => {
  assert.ok(fileExists("pnpm-lock.yaml"), "expected pnpm-lock.yaml at the repository root");
  const competitors = walkFiles(repoRoot, (name) =>
    ["package-lock.json", "yarn.lock", "bun.lockb", "bun.lock", "npm-shrinkwrap.json"].includes(name),
  );
  assert.deepEqual(competitors, [], `foreign lockfiles found: ${competitors.join(", ")}`);
});

test("pnpm recursively discovers the same workspaces as pnpm-workspace.yaml", () => {
  const expected = workspaceDirs().map((dir) => basename(dir)).sort();
  const raw = run("pnpm", ["list", "--recursive", "--depth", "-1", "--json"]);
  const listed = JSON.parse(raw);
  const actual = listed
    .map((entry) => entry.name)
    .filter((name) => name !== "misyra")
    .map((name) => name.replace(/^@misyra\//, ""))
    .sort();
  assert.deepEqual(actual, expected, "pnpm workspace discovery disagrees with pnpm-workspace.yaml");
});

test("no workspace depends on an undeclared workspace package", () => {
  const names = new Set(workspaceDirs().map((dir) => readJson(`${dir.slice(repoRoot.length + 1).replaceAll("\\", "/")}/package.json`).name));
  for (const dir of workspaceDirs()) {
    const manifest = readJson(join(dir.slice(repoRoot.length + 1).replaceAll("\\", "/"), "package.json"));
    for (const deps of [manifest.dependencies ?? {}, manifest.devDependencies ?? {}]) {
      for (const [dep, range] of Object.entries(deps)) {
        if (dep.startsWith("@misyra/")) {
          assert.ok(names.has(dep), `${manifest.name} depends on undeclared workspace ${dep}`);
          assert.match(String(range), /^workspace:/, `internal dependency must use a workspace: range: ${dep}`);
        }
      }
    }
  }
});
