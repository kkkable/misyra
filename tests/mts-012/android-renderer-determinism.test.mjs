import assert from "node:assert/strict";
import { after, test } from "node:test";

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

after(async () => {
  await closeCaptureEnvironment();
});

test(
  "the authoritative android renderer repeats the previously failing capture deterministically",
  { skip: process.env.MISYRA_ANDROID_DEVICE !== "1" },
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
