/**
 * MTS-012 explicit image-baseline update workflow.
 *
 * Regenerates ALL committed screenshot baselines from the current surfaces.
 * This is the ONLY file allowed to write into tests/mts-012/image-baselines
 * (enforced by screenshot-generation-contracts.test.mjs): normal test runs
 * never rewrite accepted baselines — an intentional visual change is adopted
 * by running `pnpm visual:update-image-baselines` and reviewing the diff.
 *
 * The deterministic pixel-identical rule still holds: this script uses the
 * exact same capture path as the tests, so a no-change run produces
 * byte-identical baselines.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "../toolchain/helpers.mjs";
import {
  IMAGE_BASELINE_PLATFORMS,
  imageBaselineName,
  requiredImageCombos,
} from "./fixtures/image-frames.mjs";
import {
  captureScreenshot,
  closeCaptureEnvironment,
  compareShots,
} from "./image-harness/capture.mjs";

const BASELINE_ROOT = join(repoRoot, "tests", "mts-012", "image-baselines");

async function main() {
  const combos = requiredImageCombos();
  let written = 0;
  let totalBytes = 0;
  for (const combo of combos) {
    for (const platform of IMAGE_BASELINE_PLATFORMS) {
      const shot = await captureScreenshot(/** @type {any} */ ({ ...combo, platform }));
      const relativePath = join(platform, imageBaselineName(combo));
      const absolutePath = join(BASELINE_ROOT, relativePath);
      const previous = safeRead(absolutePath);
      if (previous !== undefined && compareShots(shot, previous) === 0) {
        // Pixel-identical to the committed baseline — leave the file untouched.
      } else {
        mkdirSync(join(BASELINE_ROOT, platform), { recursive: true });
        writeFileSync(absolutePath, shot);
        written += 1;
      }
      totalBytes += shot.byteLength;
    }
  }
  if (written === 0) {
    process.stdout.write(
      `image baselines: up to date (${combos.length * IMAGE_BASELINE_PLATFORMS.length} combos ${IMAGE_BASELINE_PLATFORMS.join("/")}, ${totalBytes} bytes)\n`,
    );
  } else {
    process.stdout.write(`image baselines: wrote ${written} file(s), ${totalBytes} bytes total\n`);
  }
  await closeCaptureEnvironment();
}

/**
 * Read a file, returning undefined when it does not exist.
 * @param {string} filePath
 */
function safeRead(filePath) {
  try {
    return readFileSync(filePath);
  } catch {
    return undefined;
  }
}

main().catch((error) => {
  process.exitCode = 1;
  process.stderr.write(`image-baseline update failed: ${error.message}\n`);
});
