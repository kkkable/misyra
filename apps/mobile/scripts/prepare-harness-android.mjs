#!/usr/bin/env node
/**
 * MTS-012 android image-harness build preparation.
 *
 * Patches the expo-prebuild-generated android project so the RELEASE bundle
 * is built from the image-harness entry
 * (tests/mts-012/image-harness/native-entry.tsx) instead of the product
 * expo-router entry. Run AFTER `expo prebuild --platform android` and
 * BEFORE `./gradlew assembleRelease` in harness builds only
 * (MISYRA_HARNESS_BUILD=1 — the emulator CI job and deliberate local
 * emulator runs). The product app is never built with this entry: normal
 * builds skip this script entirely.
 *
 * Deterministic: it requires the exact expo-generated entryFile line and
 * fails loudly if the prebuild output changes shape; rerunning it is a
 * no-op once applied.
 *
 * It only ever writes to the gitignored generated android/ project.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = join(scriptDir, "..");
const gradleFile = join(appRoot, "android", "app", "build.gradle");
const harnessEntry = join(
  appRoot,
  "..",
  "..",
  "tests",
  "mts-012",
  "image-harness",
  "native-entry.tsx",
);

const RESOLVE_MARKER = "require('expo/scripts/resolveAppEntry')";
// file() in the generated app module (android/app) resolves against that
// module dir: android/app -> android -> apps/mobile -> apps -> repo root,
// so ../../../../tests/... lands on the repository root tests dir.
const REPLACEMENT = 'entryFile = file("../../../../tests/mts-012/image-harness/native-entry.tsx")';
// Migration from the first correction round (path was one ../ short).
const LEGACY_REPLACEMENT =
  'entryFile = file("../../../tests/mts-012/image-harness/native-entry.tsx")';

if (!existsSync(join(appRoot, "android", "settings.gradle"))) {
  throw new Error(
    "harness android prep: android/ project not found — run `expo prebuild --platform android` first",
  );
}
if (!existsSync(harnessEntry)) {
  throw new Error(`harness android prep: harness entry not found at ${harnessEntry}`);
}

const source = readFileSync(gradleFile, "utf8");
if (source.includes(REPLACEMENT)) {
  process.stdout.write("harness android prep: entryFile already set (no-op)\n");
} else if (source.includes(LEGACY_REPLACEMENT)) {
  writeFileSync(gradleFile, source.replace(LEGACY_REPLACEMENT, REPLACEMENT));
  process.stdout.write("harness android prep: migrated entryFile to the correct harness path\n");
} else {
  const start = source.indexOf("entryFile = file(");
  const tail = ".execute(null, rootDir).text.trim())";
  const end = source.indexOf(tail, start);
  if (start === -1 || end === -1 || !source.slice(start, end).includes(RESOLVE_MARKER)) {
    throw new Error(
      `harness android prep: expected the expo-generated entryFile line (${RESOLVE_MARKER}) in ${gradleFile}; prebuild output changed?`,
    );
  }
  const patched = `${source.slice(0, start)}${REPLACEMENT}${source.slice(end + tail.length)}`;
  writeFileSync(gradleFile, patched);
  process.stdout.write("harness android prep: patched entryFile to the image-harness entry\n");
}
