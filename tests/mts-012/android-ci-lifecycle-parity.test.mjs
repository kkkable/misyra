import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { repoRoot } from "../toolchain/helpers.mjs";

const FULL_ANDROID_MATRIX_COMMAND = "MISYRA_ANDROID_DEVICE=1 node --test tests/mts-012/*.test.mjs";
const ANDROID_DETERMINISM_COMMAND =
  "MISYRA_ANDROID_DEVICE=1 MISYRA_ANDROID_DETERMINISM=1 node --test tests/mts-012/android-renderer-determinism.test.mjs";

test("android CI compares baselines before determinism", () => {
  const ci = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
  const matrixIndex = ci.indexOf(FULL_ANDROID_MATRIX_COMMAND);
  const determinismIndex = ci.indexOf(ANDROID_DETERMINISM_COMMAND);

  assert.ok(matrixIndex >= 0, "missing android matrix");
  assert.ok(determinismIndex >= 0, "missing determinism probe");
  assert.ok(matrixIndex < determinismIndex, "android matrix must run on fresh emulator");
});
