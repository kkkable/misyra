/**
 * MTS-002 contract: expected-failure fixtures.
 *
 * Proves that type-aware ESLint executes with real TypeScript type
 * information, that package-boundary violations are rejected for the
 * expected reasons, and that legitimate public imports keep working.
 * Every expected failure asserts the exact diagnostic or rule identifier
 * rather than accepting any nonzero exit code.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { relativePosix, repoRoot, workspaceDirs } from "../toolchain/helpers.mjs";
import { runEslintOnFile, runTool } from "./fixture-runner.mjs";

/**
 * Extract import/export specifiers from TypeScript source text.
 *
 * @param {string} source
 * @returns {string[]}
 */
function importSpecifiers(source) {
  const matches = source.matchAll(/(?:from|import)\s+["']([^"']+)["']/g);
  return [...matches].map((match) => match[1]);
}

/**
 * Detect package-boundary violations in a source file.
 * Returns human-readable violation reasons (empty when the file is clean).
 *
 * @param {string} filePath absolute path of the source file
 * @param {string} workspaceDir absolute path of the owning workspace
 * @returns {string[]}
 */
export function boundaryViolations(filePath, workspaceDir) {
  const violations = [];
  for (const specifier of importSpecifiers(readFileSync(filePath, "utf8"))) {
    if (/^@misyra\/[^/]+\/src(?:\/|$)/.test(specifier)) {
      violations.push(`deep-import into package-private source path: ${specifier}`);
    }
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(filePath), specifier);
      if (!target.startsWith(workspaceDir)) {
        violations.push(`relative import crosses a workspace boundary: ${specifier}`);
      }
    }
  }
  return violations;
}

test("the type-aware ESLint fixture fails for @typescript-eslint/no-floating-promises", () => {
  const result = runEslintOnFile("tests/fixtures/mts-002/eslint/floating-promise.ts");
  assert.equal(result.code, 1, `eslint must report lint errors, got exit ${result.code}`);
  const reports = /** @type {{ messages: { ruleId: string | null }[] }[]} */ (
    JSON.parse(result.output)
  );
  const ruleIds = reports.flatMap((report) => report.messages.map((message) => message.ruleId));
  assert.ok(
    ruleIds.includes("@typescript-eslint/no-floating-promises"),
    `expected the type-aware no-floating-promises rule, got: ${JSON.stringify(ruleIds)}`,
  );
});

test("the deep-import fixture fails for the package-boundary lint rule", () => {
  const result = runEslintOnFile("tests/fixtures/mts-002/boundary/deep-import.ts");
  assert.equal(result.code, 1, `eslint must report lint errors, got exit ${result.code}`);
  const reports = /** @type {{ messages: { ruleId: string | null }[] }[]} */ (
    JSON.parse(result.output)
  );
  const ruleIds = reports.flatMap((report) => report.messages.map((message) => message.ruleId));
  assert.ok(
    ruleIds.includes("no-restricted-imports"),
    `expected no-restricted-imports for the deep import, got: ${JSON.stringify(ruleIds)}`,
  );
});

test("the boundary scanner detects the cross-workspace relative import fixture", () => {
  const fixture = join(repoRoot, "tests/fixtures/mts-002/boundary/cross-package-relative.ts");
  const workspace = join(repoRoot, "packages/toolchain-fixture");
  const violations = boundaryViolations(fixture, workspace);
  assert.ok(
    violations.some((violation) => violation.includes("crosses a workspace boundary")),
    `expected a workspace-boundary violation, got: ${JSON.stringify(violations)}`,
  );
});

test("no tracked workspace source violates package boundaries", () => {
  const offenders = [];
  for (const dir of workspaceDirs()) {
    const src = join(dir, "src");
    if (!existsSync(src)) continue;
    for (const entry of walkTypeScript(src)) {
      const violations = boundaryViolations(entry, dir);
      if (violations.length > 0)
        offenders.push(`${relativePosix(entry)}: ${violations.join("; ")}`);
    }
  }
  assert.deepEqual(offenders, [], `boundary violations found: ${offenders.join(" | ")}`);
});

test("a valid public package import through declared exports passes", () => {
  const result = runTool("node", ["packages/toolchain-fixture/scripts/public-import-proof.mjs"]);
  assert.equal(
    result.code,
    0,
    `public import proof must succeed, got exit ${result.code}: ${result.output}`,
  );
  assert.match(result.output, /public import ok/, "proof script must confirm the import");
});

/**
 * Recursively list .ts files under a directory.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function walkTypeScript(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(/** @type {string} */ (entry.parentPath), entry.name));
}
