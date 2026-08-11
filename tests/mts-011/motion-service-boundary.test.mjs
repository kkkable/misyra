/**
 * MTS-011 contract: motion/haptic public boundary and feature isolation.
 *
 * The reusable foundation is surfaced through a single public `index.ts`
 * boundary, its framework-free cores stay free of the real Expo binding (so
 * they are deterministically testable), route/feature files stay free of
 * MTS-011 implementation logic, and no audio/interface-sound dependency is
 * introduced.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fileExists, readText, repoRoot, walkFiles } from "../toolchain/helpers.mjs";

const MOTION_DIR = "apps/mobile/src/motion";
const INDEX = join(MOTION_DIR, "index.ts");

test("motion foundation exposes a public index.ts boundary", () => {
  assert.ok(fileExists(INDEX), "missing public motion index.ts entry");
});

test("public boundary re-exports the motion and haptic API surface", () => {
  const src = readText(INDEX);
  const expected = [
    "timingDuration",
    "easingCurve",
    "releaseSpring",
    "resolveMotionAction",
    "fadeSpec",
    "createHaptics",
    "Haptics",
    "FakeHapticsAdapter",
  ];
  for (const name of expected) {
    assert.ok(src.includes(name), `motion index.ts does not surface "${name}"`);
  }
});

test("framework-free cores do not import the real Expo haptics binding", () => {
  for (const core of ["motion.ts", "haptics.ts"]) {
    const src = readText(join(MOTION_DIR, core));
    assert.ok(!src.includes("expo-haptics"), `${core} must stay framework-free`);
    assert.ok(!src.includes("react-native"), `${core} must stay framework-free`);
  }
});

test("route and feature files stay free of MTS-011 implementation logic", () => {
  const routes = walkFiles(
    join(repoRoot, "apps", "mobile", "app"),
    (name) => /\.(ts|tsx)$/.test(name),
    new Set(["node_modules", ".git", "dist", ".expo"]),
  );
  for (const file of routes) {
    const src = readText(file);
    assert.ok(
      !/\.\.\/src\/motion|@misyra\/motion|\/motion"/.test(src),
      `${file} must not import MTS-011 motion internals`,
    );
    assert.ok(
      !src.includes("expo-haptics"),
      `${file} must not use haptics directly (use the shared boundary)`,
    );
  }
});

test("no audio/interface-sound dependency is introduced", () => {
  const pkgText = readText("apps/mobile/package.json");
  for (const dep of ["expo-av", "expo-audio"]) {
    assert.ok(!pkgText.includes(dep), `must not depend on ${dep}`);
  }
});
