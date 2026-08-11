#!/usr/bin/env node
/**
 * MTS-012 explicit baseline-update workflow.
 *
 * The ONLY file allowed to write accepted baselines. Normal test runs never
 * write baselines (guarded by visual-regression-contracts.test.mjs); this
 * script exists so an intentional, reviewed layout change can be re-baselined
 * deliberately — and the git diff shows exactly what changed.
 *
 * Usage: pnpm visual:update-baselines   (or node tests/mts-012/update-baselines.mjs)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import prettier from "prettier";

import { repoRoot } from "../toolchain/helpers.mjs";
import {
  APPEARANCES,
  DEVICE_FRAMES,
  LOCALES,
  PLATFORMS,
  TEXT_SCALES,
} from "./fixtures/device-frames.mjs";
import { buildManifest, comboKey } from "./harness/manifest.mjs";

const BASELINES_DIR = join(repoRoot, "tests", "mts-012", "baselines");

function allCombos() {
  const combos = [];
  for (const platform of PLATFORMS) {
    for (const device of Object.values(DEVICE_FRAMES)) {
      for (const appearance of APPEARANCES) {
        for (const locale of LOCALES) {
          for (const textScale of TEXT_SCALES) {
            combos.push({ platform, device, appearance, locale, textScale });
          }
        }
      }
    }
  }
  return combos;
}

/**
 * Build the deterministic baseline payload for one surface.
 *
 * @param {"shell" | "primitives"} surface surface to snapshot.
 * @returns {Promise<void>} resolves once the baseline file is written.
 */
async function writeBaseline(surface) {
  /** @type {Record<string, any>} */
  const combos = {};
  for (const combo of allCombos()) {
    combos[comboKey(combo)] = buildManifest(surface, combo).layout;
  }
  // Format through the repository's own prettier so regenerated baselines
  // always satisfy `pnpm format:check`.
  const payload = (
    await prettier.format(JSON.stringify({ schema: 1, surface, combos }), {
      filepath: `${surface}.json`,
    })
  ).replace(/\r\n/g, "\n");
  const file = join(BASELINES_DIR, `${surface}.json`);
  let previous = null;
  try {
    previous = readFileSync(file, "utf8");
  } catch {
    // First run — file does not exist yet.
  }
  if (previous !== null && previous === payload) {
    console.log(`[mts-012] baselines/${surface}.json unchanged`);
    return;
  }
  mkdirSync(BASELINES_DIR, { recursive: true });
  writeFileSync(file, payload);
  console.log(`[mts-012] ${previous === null ? "created" : "updated"} baselines/${surface}.json`);
}

for (const surface of /** @type {const} */ (["shell", "primitives"])) {
  await writeBaseline(surface);
}

console.log("Review the git diff; commit only after intentional review.");
