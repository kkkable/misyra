/**
 * MTS-003 contract: workspace scaffold smoke test.
 *
 * Proves that every workspace required by MTS-003 exists, is a declared pnpm
 * workspace member, carries the approved identity, extends the shared strict
 * TypeScript configuration, participates in the Turborepo build graph, and
 * exposes only explicit public entry points. Fails before the shells exist.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readJson, relativePosix, repoRoot, workspaceDirs } from "../toolchain/helpers.mjs";

/**
 * @typedef {Object} RequiredWorkspace
 * @property {string} dir repository-relative workspace directory
 * @property {string} name manifest name
 */

/** @type {RequiredWorkspace[]} */
const REQUIRED_WORKSPACES = [
  { dir: "apps/mobile", name: "@misyra/mobile" },
  { dir: "apps/api", name: "@misyra/api" },
  { dir: "apps/worker", name: "@misyra/worker" },
  { dir: "packages/domain", name: "@misyra/domain" },
  { dir: "packages/contracts", name: "@misyra/contracts" },
  { dir: "packages/database", name: "@misyra/database" },
  { dir: "packages/localization", name: "@misyra/localization" },
  { dir: "packages/testing", name: "@misyra/testing" },
  { dir: "packages/design-tokens", name: "@misyra/design-tokens" },
];

const SHARED_CONFIG = "@misyra/typescript-config/strict-base.json";

/**
 * @param {string} dir
 */
function hasTypeScriptSources(dir) {
  const src = join(repoRoot, dir, "src");
  if (!existsSync(src)) return false;
  return readdirSync(src, { recursive: true }).some((entry) => String(entry).endsWith(".ts"));
}

for (const workspace of REQUIRED_WORKSPACES) {
  test(`${workspace.dir} exists as a declared pnpm workspace member`, () => {
    const absolute = join(repoRoot, workspace.dir);
    assert.ok(
      existsSync(join(absolute, "package.json")),
      `${workspace.dir}/package.json is missing`,
    );
    const members = workspaceDirs().map((candidate) => relativePosix(candidate));
    assert.ok(
      members.includes(workspace.dir),
      `${workspace.dir} is not discovered through pnpm-workspace.yaml`,
    );
  });

  test(`${workspace.dir} carries the approved manifest identity`, () => {
    const manifest = readJson(`${workspace.dir}/package.json`);
    assert.equal(manifest.name, workspace.name, `${workspace.dir} must be named ${workspace.name}`);
    assert.equal(manifest.private, true, `${workspace.name} must stay private`);
  });

  test(`${workspace.dir} participates in the Turborepo build graph`, () => {
    const manifest = readJson(`${workspace.dir}/package.json`);
    const scripts = /** @type {Record<string, string>} */ (manifest.scripts ?? {});
    assert.ok(
      typeof scripts.build === "string" && scripts.build.length > 0,
      `${workspace.name} must declare a build script so turbo run build covers it`,
    );
  });

  test(`${workspace.dir} exposes only explicit public entry points`, () => {
    const manifest = readJson(`${workspace.dir}/package.json`);
    assert.ok(manifest.exports, `${workspace.name} must declare an explicit exports map`);
    const serialized = JSON.stringify(manifest.exports);
    assert.ok(!serialized.includes("src/"), `${workspace.name} exports must not leak src paths`);
  });
}

test("every MTS-003 TypeScript workspace extends the shared strict configuration", () => {
  const typed = REQUIRED_WORKSPACES.filter((workspace) => hasTypeScriptSources(workspace.dir));
  assert.ok(typed.length > 0, "MTS-003 must add TypeScript workspaces");
  for (const workspace of typed) {
    const tsconfigPath = join(repoRoot, workspace.dir, "tsconfig.json");
    assert.ok(existsSync(tsconfigPath), `${workspace.dir}/tsconfig.json is missing`);
    const local = readJson(`${workspace.dir}/tsconfig.json`);
    assert.equal(local.extends, SHARED_CONFIG, `${workspace.dir} must extend ${SHARED_CONFIG}`);
  }
});

test("internal workspace dependencies use the workspace protocol", () => {
  for (const workspace of REQUIRED_WORKSPACES) {
    if (!existsSync(join(repoRoot, workspace.dir, "package.json"))) continue;
    const manifest = readJson(`${workspace.dir}/package.json`);
    for (const block of ["dependencies", "devDependencies"]) {
      const deps = /** @type {Record<string, string> | undefined} */ (manifest[block]);
      for (const [dependency, range] of Object.entries(deps ?? {})) {
        if (!dependency.startsWith("@misyra/")) continue;
        assert.equal(
          range,
          "workspace:*",
          `${workspace.name} ${block}.${dependency} must use workspace:*`,
        );
      }
    }
  }
});
