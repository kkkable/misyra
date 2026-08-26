import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { readText, repoRoot } from "../toolchain/helpers.mjs";

const EXPECTED_EMULATOR_BUILD = "15917651";
const WORKFLOWS_DIR = join(repoRoot, ".github", "workflows");
const CI_WORKFLOW = join(WORKFLOWS_DIR, "ci.yml");
const UPDATE_WORKFLOW = join(WORKFLOWS_DIR, "update-image-baselines.yml");
const BASELINE_WRITER = join(repoRoot, "tests", "mts-012", "update-image-baselines.mjs");

function emulatorBuild(workflowPath) {
  const source = readText(workflowPath);
  return source.match(/^\s*emulator-build:\s*(\d+)\s*$/m)?.[1] ?? null;
}

test("android workflows pin the emulator build", () => {
  const ci = emulatorBuild(CI_WORKFLOW);
  const updater = emulatorBuild(UPDATE_WORKFLOW);

  assert.equal(ci, EXPECTED_EMULATOR_BUILD);
  assert.equal(updater, EXPECTED_EMULATOR_BUILD);
  assert.equal(ci, updater);
});

test("baseline writer records the emulator build", () => {
  const source = readText(BASELINE_WRITER);

  assert.match(source, /emulatorVersion:\s*"37\.1\.11"/);
  assert.match(source, /emulatorBuild:\s*15917651/);
});
