import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

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

/**
 * Locate the pixels counted by the same pixelmatch threshold as compareShots.
 * diffMask keeps unchanged pixels transparent, so the non-zero alpha bounds
 * identify whether Android repeat drift is SystemUI/inset-shaped or content-local.
 * @param {Buffer} first
 * @param {Buffer} second
 */
function diffGeometry(first, second) {
  const a = PNG.sync.read(first);
  const b = PNG.sync.read(second);
  assert.equal(a.width, b.width, "repeat captures must have the same width");
  assert.equal(a.height, b.height, "repeat captures must have the same height");

  const diff = Buffer.alloc(a.width * a.height * 4);
  const differingPixels = pixelmatch(a.data, b.data, diff, a.width, a.height, {
    threshold: 0.1,
    diffMask: true,
  });

  if (differingPixels === 0) {
    return { differingPixels, minX: null, minY: null, maxX: null, maxY: null, width: 0, height: 0 };
  }

  let minX = a.width;
  let minY = a.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      if (diff[(y * a.width + x) * 4 + 3] === 0) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    differingPixels,
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

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
    const geometry = diffGeometry(first, second);
    const geometryDetail =
      geometry.differingPixels === 0
        ? "no differing-pixel bounds"
        : `diff bbox x=${geometry.minX}..${geometry.maxX}, y=${geometry.minY}..${geometry.maxY} (${geometry.width}x${geometry.height}), ${geometry.differingPixels} differing pixels`;

    assert.equal(
      ratio,
      0,
      `two unchanged authoritative captures of primitives-360x800-light-zh-HK-1x must be pixel-identical (observed ${(ratio * 100).toFixed(2)}% drift; ${geometryDetail})`,
    );
  },
);
