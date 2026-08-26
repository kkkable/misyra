/**
 * MTS-012 explicit image-baseline update workflow.
 *
 * Regenerates ALL committed screenshot baselines from the current surfaces
 * on every platform in IMAGE_BASELINE_PLATFORMS. This is the ONLY file
 * allowed to write into tests/mts-012/image-baselines (enforced by
 * screenshot-generation-contracts.test.mjs): normal test runs never rewrite
 * accepted baselines — an intentional visual change is adopted by running
 * `pnpm visual:update-image-baselines` and reviewing the diff.
 *
 * Platforms:
 * - web — always regenerated (deterministic Chromium layer, optional
 *   supplemental coverage).
 * - android — regenerated only when an android device is attached AND
 *   MISYRA_ANDROID_DEVICE=1 is set (the explicit emulator run). Without the
 *   flag the android namespace is left untouched with a message; with the
 *   flag a missing device is a hard error so the authoritative mobile
 *   baselines can never be dropped silently.
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

/** Renderer identity recorded in each platform namespace manifest. */
/** @type {Record<string, string>} */
const RENDERERS = Object.freeze({
  web: "headless chromium (playwright) - optional supplemental deterministic web layer",
  android:
    "android emulator framebuffer - actual supported mobile-platform renderer (emulator 37.1.11 build 15917651, android-35 google_apis x86_64, pixel_2, swiftshader_indirect, 160dpi / 1x density, KVM)",
});

/**
 * Authoritative Android renderer provenance. Keep this aligned with both the
 * normal CI Android job and the explicit update workflow; the contracts fail
 * if either workflow drifts from this fingerprint.
 */
const ANDROID_RENDERER_FINGERPRINT = Object.freeze({
  apiLevel: "35",
  systemImage: "android-35;google_apis;x86_64",
  arch: "x86_64",
  emulatorVersion: "37.1.11",
  emulatorBuild: 15917651,
  emulatorProfile: "pixel_2",
  avdName: "misyra",
  graphicsRenderer: "swiftshader_indirect",
  kvmAcceleration: true,
  adbWaitForDevice: true,
  bootTimeoutSeconds: 600,
  densityDpi: 160,
  platformNamespace: "android",
  logicalCaptureSizes: Object.freeze(["360x800", "412x915"]),
  locales: Object.freeze(["en", "zh-HK"]),
  appearances: Object.freeze(["light", "dark"]),
  textScales: Object.freeze([1, 2]),
});

async function main() {
  const combos = requiredImageCombos();
  const androidRequired = process.env.MISYRA_ANDROID_DEVICE === "1";
  const platforms = androidRequired
    ? IMAGE_BASELINE_PLATFORMS
    : IMAGE_BASELINE_PLATFORMS.filter((platform) => platform !== "android");
  if (!androidRequired) {
    process.stdout.write(
      "image baselines: android namespace left untouched (set MISYRA_ANDROID_DEVICE=1 with an attached android device to regenerate the authoritative mobile baselines)\n",
    );
  }
  let written = 0;
  let totalBytes = 0;
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(platforms.map((platform) => [platform, 0]));
  // Capture order: en before zh-HK so the android device-locale switch
  // (framework restart) happens once per run instead of once per combo.
  const ordered = [...combos].sort((a, b) =>
    a.locale === b.locale ? 0 : a.locale === "en" ? -1 : 1,
  );
  for (const combo of ordered) {
    for (const platform of platforms) {
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
      counts[platform] = (counts[platform] ?? 0) + 1;
      totalBytes += shot.byteLength;
    }
  }
  for (const platform of platforms) {
    const manifest = {
      platform,
      renderer: RENDERERS[platform],
      ...(platform === "android" ? { rendererFingerprint: ANDROID_RENDERER_FINGERPRINT } : {}),
      densityScale: 1,
      baselineCount: counts[platform],
    };
    mkdirSync(join(BASELINE_ROOT, platform), { recursive: true });
    writeFileSync(
      join(BASELINE_ROOT, platform, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }
  const covered = platforms.join("/");
  if (written === 0) {
    process.stdout.write(
      `image baselines: up to date (${combos.length * platforms.length} combos ${covered}, ${totalBytes} bytes)\n`,
    );
  } else {
    process.stdout.write(
      `image baselines: wrote ${written} file(s) on ${covered}, ${totalBytes} bytes total\n`,
    );
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

main()
  .catch((error) => {
    process.exitCode = 1;
    process.stderr.write(`image-baseline update failed: ${error.message}\n`);
  })
  .finally(async () => {
    // Always release the harness servers so the process can exit even when
    // a capture fails mid-run.
    await closeCaptureEnvironment();
  });
