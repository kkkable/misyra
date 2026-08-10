/**
 * MTS-007 contract: CI quality-gate definition.
 *
 * Technical specification section 28 requires every pull request to run:
 * lockfile-based install, formatting, lint, TypeScript checks, unit tests,
 * affected integration tests, build, a high-severity dependency audit, a
 * deterministic secret scan, a localization-completeness check, a
 * privacy/logging check, and static Bicep compilation with a pinned,
 * deterministic toolchain. Normal CI must never require Apple, Google,
 * Azure, AI, production, or other provider credentials, and must not
 * configure secret-bearing artifacts or environment dumps.
 *
 * These contracts inspect the real GitHub Actions workflow so the gate
 * cannot pass from a duplicated constant alone.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "yaml";
import { fileExists, readText } from "../toolchain/helpers.mjs";

const WORKFLOW_PATH = ".github/workflows/ci.yml";

const BICEP_VERSION = "v0.45.6";
const BICEP_LINUX_SHA256 = "3fae480c469677788f1552f55e70e31c8084f80769c7e8353118327e0ab361e4";
const BICEP_WINDOWS_SHA256 = "38c8cd33ba8f0ac4ffd2b8114382b69cb62ffe1d040fde7e622d78ce77acb56e";

/**
 * Every core section-28 gate that must be wired into CI, as [name, pattern]
 * pairs matched against `run` bodies.
 *
 * @type {Array<[string, RegExp]>}
 */
const REQUIRED_GATE_INVOCATIONS = [
  ["formatting check", /pnpm format:check/],
  ["lint", /pnpm lint/],
  ["root TypeScript check", /pnpm typecheck/],
  ["workspace TypeScript checks", /turbo run typecheck/],
  ["unit tests", /pnpm test/],
  ["build", /pnpm build/],
  ["high-severity dependency audit", /pnpm audit --audit-level=high/],
  ["contract/infrastructure validation", /pnpm infra:validate/],
];

function workflowText() {
  assert.ok(fileExists(WORKFLOW_PATH), `expected ${WORKFLOW_PATH}`);
  return readText(WORKFLOW_PATH);
}

/**
 * Parse the workflow document.
 *
 * @returns {Record<string, any>}
 */
function workflow() {
  const doc = parse(workflowText());
  assert.ok(doc && typeof doc === "object", "ci.yml must parse as YAML");
  assert.ok(doc.jobs && typeof doc.jobs === "object", "ci.yml must declare jobs");
  return doc;
}

/**
 * Every `run` script body across every job and step.
 *
 * @param {Record<string, any>} doc
 * @returns {string[]}
 */
function allRunBodies(doc) {
  const runs = [];
  for (const job of Object.values(doc.jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.run === "string") runs.push(step.run);
    }
  }
  return runs;
}

/**
 * Every step across every job.
 *
 * @param {Record<string, any>} doc
 * @returns {Array<Record<string, any>>}
 */
function allSteps(doc) {
  const steps = [];
  for (const job of Object.values(doc.jobs)) {
    steps.push(...(job.steps ?? []));
  }
  return steps;
}

test("the CI workflow exists, parses, and defines jobs", () => {
  const doc = workflow();
  assert.ok(Object.keys(doc.jobs).length >= 1, "ci.yml must declare at least one job");
});

test("the workflow requests least-privilege permissions", () => {
  const doc = workflow();
  assert.equal(doc.permissions?.contents, "read", "workflow must request contents: read only");
});

test("the toolchain matrix preserves Ubuntu and Windows coverage", () => {
  const doc = workflow();
  const toolchain = doc.jobs.toolchain;
  assert.ok(toolchain, "ci.yml must keep a toolchain job");
  assert.ok(Array.isArray(toolchain.strategy?.matrix?.os), "toolchain job must use an OS matrix");
  assert.ok(
    toolchain.strategy.matrix.os.includes("ubuntu-latest"),
    "toolchain matrix must preserve Ubuntu coverage",
  );
  assert.ok(
    toolchain.strategy.matrix.os.includes("windows-latest"),
    "toolchain matrix must preserve Windows coverage",
  );
});

test("CI runs from a clean checkout with pinned Node 24 and frozen-lockfile install", () => {
  const doc = workflow();
  const uses = allSteps(doc).map((step) => step.uses ?? "");
  assert.ok(
    uses.some((u) => u.startsWith("actions/checkout@")),
    "actions/checkout step missing",
  );
  assert.ok(
    uses.some((u) => u.startsWith("pnpm/action-setup@")),
    "pnpm/action-setup step missing (packageManager pin)",
  );
  const nodeSetup = allSteps(doc).filter(
    (step) => typeof step.uses === "string" && step.uses.startsWith("actions/setup-node@"),
  );
  assert.ok(nodeSetup.length >= 1, "actions/setup-node step missing");
  for (const step of nodeSetup) {
    assert.equal(
      String(step.with?.["node-version"]),
      "24",
      "every setup-node step must pin Node 24",
    );
  }
  const runs = allRunBodies(doc);
  assert.ok(
    runs.some((r) => /pnpm install --frozen-lockfile/.test(r)),
    "frozen-lockfile install step missing",
  );
});

test("CI covers the core section-28 gates", () => {
  const runs = allRunBodies(workflow());
  for (const [name, pattern] of REQUIRED_GATE_INVOCATIONS) {
    assert.ok(
      runs.some((r) => pattern.test(r)),
      `CI is missing the ${name} gate`,
    );
  }
});

test("CI runs a deterministic secret-scan gate", () => {
  const runs = allRunBodies(workflow());
  assert.ok(
    runs.some(
      (r) => /(^|\s)pnpm secret:scan(\s|$)/.test(r) || /node scripts\/ci\/secret-scan\.mjs/.test(r),
    ),
    "CI is missing a deterministic secret-scan gate",
  );
});

test("CI runs a localization-completeness gate for English and zh-HK", () => {
  const runs = allRunBodies(workflow());
  assert.ok(
    runs.some(
      (r) =>
        /(^|\s)pnpm localization:check(\s|$)/.test(r) ||
        /node scripts\/ci\/localization-check\.mjs/.test(r),
    ),
    "CI is missing the localization-completeness gate",
  );
});

test("CI runs a privacy/logging static gate", () => {
  const runs = allRunBodies(workflow());
  assert.ok(
    runs.some(
      (r) =>
        /(^|\s)pnpm privacy:check(\s|$)/.test(r) ||
        /node scripts\/ci\/privacy-logging-check\.mjs/.test(r),
    ),
    "CI is missing the privacy/logging gate",
  );
});

test("CI statically compiles the Bicep skeleton with a pinned deterministic toolchain and no Azure login or deployment", () => {
  const text = workflowText();
  const runs = allRunBodies(workflow());
  assert.ok(
    runs.some((r) => r.includes(BICEP_VERSION) && r.includes("bicep-linux-x64")),
    "CI must download the pinned Linux Bicep CLI binary",
  );
  assert.ok(
    runs.some((r) => r.includes(BICEP_VERSION) && r.includes("bicep-win-x64.exe")),
    "CI must download the pinned Windows Bicep CLI binary",
  );
  assert.ok(
    text.includes(BICEP_LINUX_SHA256),
    "CI must verify the pinned Linux Bicep binary SHA-256",
  );
  assert.ok(
    text.includes(BICEP_WINDOWS_SHA256),
    "CI must verify the pinned Windows Bicep binary SHA-256",
  );
  assert.ok(
    runs.some((r) => /pnpm bicep:validate/.test(r)),
    "CI must run the MTS-006 Bicep compile suite against the installed compiler",
  );
  for (const forbidden of ["az login", "az deployment", "az group", "--deploy"]) {
    assert.ok(!text.includes(forbidden), `CI must not contain ${forbidden}`);
  }
});

test("normal CI excludes live provider tests and provider credentials", () => {
  const text = workflowText();
  for (const forbidden of [
    "secrets.",
    "az login",
    "gcloud auth",
    "firebase",
    "fastlane",
    "app-store-connect",
    "APPLE_",
    "GOOGLE_",
    "AZURE_",
  ]) {
    assert.ok(!text.includes(forbidden), `CI must not reference ${forbidden}`);
  }
});

test("CI configures no secret-bearing artifacts or environment dumps", () => {
  const text = workflowText();
  for (const forbidden of ["upload-artifact", "printenv", "env >", "env |", "env >>"]) {
    assert.ok(!text.includes(forbidden), `CI must not use ${forbidden}`);
  }
  assert.ok(!/(^|\s)echo\s+\$/.test(text), "CI must not echo environment variables");
});

test("CI includes a deterministic local-service integration gate without provider credentials", () => {
  const doc = workflow();
  const integration = doc.jobs.integration;
  assert.ok(
    integration,
    "ci.yml must declare an integration job for affected-package integration tests",
  );
  assert.equal(
    integration["runs-on"],
    "ubuntu-latest",
    "integration job must run on ubuntu-latest",
  );
  const steps = /** @type {Array<Record<string, any>>} */ (integration.steps ?? []);
  const runs = steps.map((step) => step.run ?? "");
  assert.ok(
    runs.some((r) => /pnpm dev:up/.test(r)),
    "integration job must start local services",
  );
  assert.ok(
    runs.some((r) => /pnpm test:services/.test(r)),
    "integration job must run the local-service integration suite",
  );
  assert.ok(
    runs.some((r) => /pnpm dev:down/.test(r)),
    "integration job must stop local services",
  );
  assert.ok(
    steps.some((step) => step.if === "always()" && /dev:down/.test(step.run ?? "")),
    "integration cleanup must run even on failure",
  );
});
