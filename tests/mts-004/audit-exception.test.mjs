/**
 * MTS-004 correction contract: the dependency audit gate may exempt exactly the
 * two Commander-authorized GitHub advisories and nothing else.
 *
 * Context: the transitive Expo/Metro `image-size` dependency carries two HIGH
 * advisories (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq) for which no patched
 * upstream release currently exists. The Commander authorized a temporary,
 * documented exception for exactly those two advisory IDs while the audit
 * gate must otherwise stay intact:
 *
 *   - the repository audit command keeps `--audit-level=high`;
 *   - no package name, severity class, dependency subtree, wildcard, or
 *     CVE-based suppression may appear;
 *   - any extra or different advisory added to the exception list must fail
 *     this contract, as must a weakened severity threshold.
 *
 * The mechanism is the pinned pnpm version's exact-advisory support:
 * `pnpm.auditConfig.ignoreGhsas` filters advisories by exact
 * `github_advisory_id` before the severity threshold is applied, so any
 * unrelated or future HIGH/CRITICAL advisory still fails the audit gate.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readJson, readText } from "../toolchain/helpers.mjs";

/** The complete authorized exception set; nothing else may be ignored. */
const AUTHORIZED_GHSAS = ["GHSA-5p2g-fcmc-qvqq", "GHSA-w3rx-r6r6-pgpr"];

/** Exact GitHub Security Advisory identifier shape (no wildcards allowed). */
const GHSA_ID = /^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/;

/** The audit invocation both CI and the repository scripts must preserve. */
const HIGH_GATE = "pnpm audit --audit-level=high";

test("the root manifest declares the exact two-GHSA audit exception", () => {
  const manifest = /** @type {Record<string, unknown>} */ (readJson("package.json"));
  const pnpmSection = manifest.pnpm;
  assert.ok(
    pnpmSection && typeof pnpmSection === "object",
    "root package.json must declare a `pnpm` section holding the audit exception",
  );
  const auditConfig = /** @type {Record<string, unknown>} */ (pnpmSection).auditConfig;
  assert.ok(
    auditConfig && typeof auditConfig === "object",
    "pnpm.auditConfig must exist so the exception is explicit and reviewable",
  );
  const keys = Object.keys(auditConfig).sort();
  assert.deepEqual(
    keys,
    ["ignoreGhsas"],
    "auditConfig must use only the exact-advisory mechanism (no ignoreCves or other suppressions)",
  );
  const ignoreGhsas = /** @type {unknown} */ (auditConfig.ignoreGhsas);
  assert.ok(Array.isArray(ignoreGhsas), "pnpm.auditConfig.ignoreGhsas must be an array");
  const ids = /** @type {unknown[]} */ (ignoreGhsas);
  assert.deepEqual(
    [...ids].sort(),
    AUTHORIZED_GHSAS,
    "the exception list must contain exactly the two authorized advisories and no others",
  );
  for (const id of ids) {
    assert.equal(typeof id, "string", "every exception entry must be a string");
    assert.match(
      /** @type {string} */ (id),
      GHSA_ID,
      "entries must be exact GHSA identifiers: no package names, wildcards, or subtrees",
    );
  }
});

test("the repository audit command still enforces the HIGH severity threshold", () => {
  const manifest = /** @type {Record<string, unknown>} */ (readJson("package.json"));
  const scripts = /** @type {Record<string, unknown>} */ (manifest.scripts ?? {});
  const audit = scripts.audit;
  assert.equal(typeof audit, "string", "root package.json must keep an `audit` script");
  const command = /** @type {string} */ (audit);
  assert.ok(
    command.includes(HIGH_GATE),
    `the audit script must keep \`${HIGH_GATE}\` (found: ${command})`,
  );
  assert.ok(
    !/--audit-level=(low|moderate)\b/.test(command),
    "the audit script must not lower the severity threshold",
  );
  assert.ok(
    !/\b(--ignore|--ignore-unfixable|--fix)\b/.test(command),
    "the audit script must not use broad suppression or auto-fix flags",
  );
});

test("CI still runs the HIGH-severity audit gate against the committed configuration", () => {
  const workflow = readText(".github/workflows/ci.yml");
  assert.ok(
    workflow.includes(HIGH_GATE),
    `CI must keep running \`${HIGH_GATE}\` so unrelated new HIGH or CRITICAL advisories still fail the gate`,
  );
});
