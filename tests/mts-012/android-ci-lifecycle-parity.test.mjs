import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { repoRoot } from "../toolchain/helpers.mjs";

const FULL_ANDROID_MATRIX_COMMAND =
  "MISYRA_ANDROID_DEVICE=1 node --test tests/mts-012/*.test.mjs";
const ANDROID_DETERMINISM_COMMAND =
  "MISYRA_ANDROID_DEVICE=1 MISYRA_ANDROID_DETERMINISM=1 node --test tests/mts-012/android-renderer-determinism.test.mjs";

test(
  "authoritative android baseline comparison enters the fresh lifecycle before the state-mutating determinism probe",
  () => {
    const ci = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
    const matrixIndex = ci.indexOf(FULL_ANDROID_MATRIX_COMMAND);
    const determinismIndex = ci.indexOf(ANDROID_DETERMINISM_COMMAND);

    assert.ok(matrixIndex >= 0, "android CI must run the full MTS-012 authoritative matrix");
    assert.ok(determinismIndex >= 0, "android CI must run the dedicated determinism probe");
    assert.ok(
      matrixIndex < determinismIndex,
      "the committed-baseline comparison must run first on the fresh emulator, matching the explicit updater lifecycle; the zh-HK determinism probe may mutate persistent locale/framework state only after conformance completes",
    );
  },
);
