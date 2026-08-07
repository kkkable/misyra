/**
 * MTS-002 contract: shared configuration packages.
 *
 * Verifies that the approved configuration packages exist, are private,
 * expose only intentional public entry points through explicit export maps,
 * and that every documented export target exists on disk.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readJson, relativePosix, workspaceDirs } from "../toolchain/helpers.mjs";

/** @type {Record<string, string[]>} */
const EXPECTED_EXPORTS = {
  "@misyra/typescript-config": ["./strict-base.json"],
  "@misyra/eslint-config": ["./base", "./typescript"],
  "@misyra/prettier-config": ["."],
  "@misyra/test-config": [".", "./fixture-runner"],
};

/**
 * @param {string} name
 */
function workspaceManifest(name) {
  const dir = workspaceDirs().find((candidate) =>
    relativePosix(candidate).endsWith(name.replace("@misyra/", "")),
  );
  assert.ok(dir, `workspace package is missing: ${name}`);
  return { dir, manifest: readJson(`${relativePosix(dir)}/package.json`) };
}

for (const [name, exportKeys] of Object.entries(EXPECTED_EXPORTS)) {
  test(`${name} exists and is a private workspace package`, () => {
    const { manifest } = workspaceManifest(name);
    assert.equal(manifest.name, name);
    assert.equal(manifest.private, true, `${name} must be private`);
    assert.ok(manifest.exports, `${name} must declare an explicit exports map`);
  });

  test(`${name} exposes exactly the documented public entry points`, () => {
    const { manifest } = workspaceManifest(name);
    const keys = Object.keys(/** @type {Record<string, unknown>} */ (manifest.exports)).sort();
    assert.deepEqual(keys, [...exportKeys].sort(), `${name} export surface changed`);
    for (const key of keys) {
      assert.ok(!key.includes("src"), `${name} must not expose src paths: ${key}`);
    }
  });

  test(`${name} documented exports resolve to real files`, () => {
    const { dir, manifest } = workspaceManifest(name);
    for (const key of exportKeys) {
      const target =
        key === "."
          ? /** @type {string} */ (manifest.main)
          : /** @type {string} */ (
              /** @type {{ default?: string }} */ (manifest.exports[key]).default
            );
      assert.equal(typeof target, "string", `${name} export ${key} must map to a file`);
      assert.ok(
        existsSync(join(dir, target.replace(/^\.\//, ""))),
        `${name} export ${key} target does not exist: ${target}`,
      );
    }
  });
}

test("@misyra/eslint-config depends on typescript-eslint for type-aware rules", () => {
  const { manifest } = workspaceManifest("@misyra/eslint-config");
  const deps = /** @type {Record<string, string>} */ (manifest.dependencies ?? {});
  assert.match(
    deps["typescript-eslint"] ?? "",
    /^\d+\.\d+\.\d+$/,
    "typescript-eslint must be an exactly pinned dependency of @misyra/eslint-config",
  );
});

test("no configuration package exposes private implementation paths", () => {
  for (const name of Object.keys(EXPECTED_EXPORTS)) {
    const { manifest } = workspaceManifest(name);
    const serialized = JSON.stringify(manifest.exports ?? {});
    assert.ok(!serialized.includes("/src/"), `${name} exports leak a src path`);
    assert.ok(!serialized.includes("src/"), `${name} exports leak a src path`);
  }
});
