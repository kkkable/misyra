import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { readText, repoRoot } from "../toolchain/helpers.mjs";

const EXPECTED_EMULATOR_BUILD = "15917651";
const EXPECTED_EMULATOR_VERSION = "37.1.11";

function emulatorBuild(workflowPath) {
  const source = readText(workflowPath);
  return (
    source.match(/\nemulator-build:\s*(\d+)/)?.[1] ??
    source.match(/\n\s+emulator-build:\s*(\d+)/)?.[1] ??
    null
  );
}

test("authoritative android workflows pin the same emulator binary build", () => {
  const ci = emulatorBuild(join(repoRoot, ".github", "workflows", "ci.yml"));
  const updater = emulatorBuild(
    join(repoRoot, ".github", "workflows", "update-image-baselines.yml"),
  );

  assert.equal(ci, EXPECTED_EMULATOR_BUILD, "CI must pin the approved emulator build");
  assert.equal(
    updater,
    EXPECTED_EMULATOR_BUILD,
    "the explicit baseline updater must pin the approved emulator build",
  );
  assert.equal(ci, updater, "CI and baseline updater emulator builds must remain identical");
});

test("the explicit baseline writer records the pinned emulator build", () => {
  const updater = readText(
    join(repoRoot, "tests", "mts-012", "update-image-baselines.mjs"),
  );

  assert.match(
    updater,
    new RegExp(
      `emulatorVersion:\\s*[\"']${EXPECTED_EMULATOR_VERSION.replaceAll(".", "\\.")}[\"']`,
    ),
  );
  assert.match(updater, new RegExp(`emulatorBuild:\\s*${EXPECTED_EMULATOR_BUILD}`));
});
