/**
 * MTS-002 contract: dependency hygiene.
 *
 * Every direct dependency in the repository must be exactly pinned, and the
 * repository must keep exactly one lockfile.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readJson, relativePosix, workspaceDirs } from "../toolchain/helpers.mjs";

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
const WORKSPACE_RANGE = /^workspace:\*/;

test("every direct dependency is exactly pinned", () => {
  const manifests = [
    { location: "package.json", manifest: readJson("package.json") },
    ...workspaceDirs().map((dir) => ({
      location: `${relativePosix(dir)}/package.json`,
      manifest: readJson(`${relativePosix(dir)}/package.json`),
    })),
  ];
  const offenders = [];
  for (const { location, manifest } of manifests) {
    for (const block of ["dependencies", "devDependencies"]) {
      const deps = /** @type {Record<string, string> | undefined} */ (manifest[block]);
      for (const [name, range] of Object.entries(deps ?? {})) {
        const valid = name.startsWith("@misyra/")
          ? WORKSPACE_RANGE.test(range)
          : EXACT_VERSION.test(range);
        if (!valid) offenders.push(`${location} ${block}.${name}=${range}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `unpinned dependencies found: ${offenders.join(", ")}`);
});

test("typescript-eslint is pinned exactly at the root for config composition", () => {
  const root = readJson("package.json");
  const deps = /** @type {Record<string, string>} */ (root.devDependencies ?? {});
  assert.match(
    deps["typescript-eslint"] ?? "",
    EXACT_VERSION,
    "root devDependencies must pin typescript-eslint exactly",
  );
});
