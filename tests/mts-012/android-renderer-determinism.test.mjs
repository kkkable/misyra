import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";

import { repoRoot } from "../toolchain/helpers.mjs";
import {
  captureScreenshot,
  closeCaptureEnvironment,
  compareShots,
} from "./image-harness/capture.mjs";

const FAILING_REFERENCE_COMBO = Object.freeze({
  surface: "primitives",
  platform: "android",
  width: 360,
  height: 800,
  appearance: "light",
  locale: "zh-HK",
  textScale: 1,
});

const ANDROID_DETERMINISM_COMMAND =
  "MISYRA_ANDROID_DEVICE=1 MISYRA_ANDROID_DETERMINISM=1 node --test tests/mts-012/android-renderer-determinism.test.mjs";

const RUN_ANDROID_DETERMINISM =
  process.env.MISYRA_ANDROID_DEVICE === "1" && process.env.MISYRA_ANDROID_DETERMINISM === "1";

after(async () => {
  await closeCaptureEnvironment();
});

test("the explicit baseline updater preserves android renderer provenance", () => {
  const updater = readFileSync(
    join(repoRoot, "tests", "mts-012", "update-image-baselines.mjs"),
    "utf8",
  );

  assert.match(
    updater,
    /rendererFingerprint/,
    "the explicit updater must write the rendererFingerprint instead of erasing provenance",
  );
  for (const field of [
    "apiLevel",
    "systemImage",
    "arch",
    "emulatorProfile",
    "graphicsRenderer",
    "kvmAcceleration",
    "adbWaitForDevice",
    "bootTimeoutSeconds",
  ]) {
    assert.match(
      updater,
      new RegExp(`\\b${field}\\b`),
      `the explicit updater must preserve rendererFingerprint.${field}`,
    );
  }
});

test("android CI runs the determinism probe as a dedicated serialized command", () => {
  const ci = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
  assert.ok(
    ci.includes(ANDROID_DETERMINISM_COMMAND),
    "the emulator job must run the repeated-capture probe separately so no second test process drives the same ADB device concurrently",
  );
});

test(
  "the authoritative android renderer repeats the previously failing capture deterministically",
  { skip: !RUN_ANDROID_DETERMINISM },
  async () => {
    const first = await captureScreenshot(FAILING_REFERENCE_COMBO);
    const second = await captureScreenshot(FAILING_REFERENCE_COMBO);
    const ratio = compareShots(first, second);

    assert.equal(
      ratio,
      0,
      `two unchanged authoritative captures of primitives-360x800-light-zh-HK-1x must be pixel-identical (observed ${(ratio * 100).toFixed(2)}% drift)`,
    );
  },
);
