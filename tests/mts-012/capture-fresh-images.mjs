/**
 * MTS-012 fresh-capture dump — transient correction tooling.
 *
 * Captures every required combo on ONE platform through the exact same
 * deterministic capture path the conformance gates use, writes the fresh
 * PNGs into an explicit dump directory (MISYRA_CAPTURE_DUMP), and reports
 * each capture's pixel drift against the committed baselines for review.
 *
 * This is NOT a baseline writer: it never touches the committed baseline
 * directories. Adopting fresh captures as accepted baselines is a separate,
 * deliberate step — review the dumped artifact, copy the reviewed files
 * into tests/mts-012/image-baselines/<platform>/, and commit the diff.
 *
 * Android dumps (the default) additionally require MISYRA_ANDROID_DEVICE=1
 * with an attached emulator, exactly like the authoritative mobile gate.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  IMAGE_BASELINES_DIR,
  imageBaselineName,
  requiredImageCombos,
} from "./fixtures/image-frames.mjs";
import {
  captureScreenshot,
  closeCaptureEnvironment,
  compareShots,
} from "./image-harness/capture.mjs";

async function main() {
  const dumpDir = process.env.MISYRA_CAPTURE_DUMP;
  if (dumpDir === undefined || dumpDir === "") {
    throw new Error("capture dump: MISYRA_CAPTURE_DUMP must set the dump directory");
  }
  const platform = process.env.MISYRA_CAPTURE_PLATFORM ?? "android";
  mkdirSync(dumpDir, { recursive: true });
  const combos = requiredImageCombos();
  // Same capture order as the explicit baseline writer: en before zh-HK so
  // the android device-locale switch (a framework restart) happens once per
  // run instead of once per combo.
  const ordered = [...combos].sort((a, b) =>
    a.locale === b.locale ? 0 : a.locale === "en" ? -1 : 1,
  );
  let index = 0;
  for (const combo of ordered) {
    index += 1;
    const shot = await captureScreenshot(/** @type {any} */ ({ ...combo, platform }));
    const name = imageBaselineName(combo);
    writeFileSync(join(dumpDir, name), shot);
    let report = `${name} (${shot.byteLength} bytes)`;
    try {
      const baseline = readFileSync(join(IMAGE_BASELINES_DIR, platform, name));
      const ratio = compareShots(shot, baseline);
      report += ` — drift vs committed ${(ratio * 100).toFixed(2)}%`;
    } catch {
      report += " — no comparable committed baseline";
    }
    process.stdout.write(`[${index}/${ordered.length}] ${report}\n`);
  }
  process.stdout.write(
    `capture dump: wrote ${ordered.length} ${platform} capture(s) to ${dumpDir}\n`,
  );
}

main()
  .catch((error) => {
    process.exitCode = 1;
    process.stderr.write(`capture dump failed: ${error.message}\n`);
  })
  .finally(async () => {
    // Always release the harness servers so the process can exit even when a
    // capture fails mid-run.
    await closeCaptureEnvironment();
  });
