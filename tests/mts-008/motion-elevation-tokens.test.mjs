/**
 * MTS-008 contract (correction round 2): centralized motion and elevation
 * tokens (technical specification §7.2 and §6.8).
 *
 *   - `duration` — exact §7.2 timing durations, including the approved
 *     celebration bounds (celebrationMin/celebrationMax);
 *   - `easing`   — exact §7.2 cubic-bezier curves;
 *   - `spring`   — exact §7.2 release spring;
 *   - `elevation`— centralized semantic elevation levels (§6.8): card,
 *     bottom-sheet/top separation, and floating/primary action, with
 *     restrained shadows only and platform-specific iOS/Android
 *     representations.
 *
 * These contracts are intended to FAIL against the reviewed head
 * bc0e357... (which exports no motion/elevation families) and go green once
 * the tokens are implemented. Motion/haptic *behavior* (helpers, Reanimated,
 * Reduce Motion service, haptics) remains out of scope (MTS-011).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { repoRoot } from "../toolchain/helpers.mjs";

const PACKAGE_DIR = join(repoRoot, "packages", "design-tokens");
const DIST_ENTRY = join(PACKAGE_DIR, "dist", "index.js");

/** Materialize the built public entry in a fresh checkout (same pattern as the other MTS-008 contracts). */
function ensureBuilt() {
  if (!existsSync(DIST_ENTRY)) {
    execFileSync(process.execPath, [join(PACKAGE_DIR, "scripts", "build.mjs")], {
      cwd: PACKAGE_DIR,
      encoding: "utf8",
    });
  }
}

/** @type {any} */ let cachedTokens;

/** @returns {Promise<any>} the design-tokens public entry module */
async function loadTokens() {
  if (cachedTokens === undefined) {
    ensureBuilt();
    cachedTokens = await import(pathToFileURL(DIST_ENTRY).href);
  }
  return cachedTokens;
}

/** Exact §7.2 timing durations (ms), including celebration bounds. */
const EXPECTED_DURATION = {
  instant: 80,
  fast: 140,
  standard: 220,
  sheet: 280,
  emphasis: 420,
  celebrationMin: 600,
  celebrationMax: 900,
};

/** Exact §7.2 cubic-bezier easing curves. */
const EXPECTED_EASING = {
  standard: [0.2, 0.0, 0.0, 1.0],
  enter: [0.0, 0.0, 0.2, 1.0],
  exit: [0.4, 0.0, 1.0, 1.0],
};

/** Exact §7.2 release spring. */
const EXPECTED_SPRING = {
  damping: 22,
  stiffness: 260,
  mass: 0.8,
};

/**
 * Centralized §6.8 elevation levels.
 *
 * Restrained shadows only: `card` is a subtle 1–2 pt vertical offset with
 * low opacity; `sheet` casts a stronger shadow upward (bottom sheets slide
 * from the bottom, so their separation shadow sits on top); `floating` is
 * the medium elevation for floating capture / primary action. iOS uses
 * shadow properties, Android uses material elevation — the numeric
 * representations differ per platform by design (§6.8) but stay centralized.
 */
const EXPECTED_ELEVATION = {
  card: {
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
    },
    android: { elevation: 2 },
  },
  sheet: {
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
    },
    android: { elevation: 12 },
  },
  floating: {
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
    },
    android: { elevation: 16 },
  },
};

test("duration family matches the exact §7.2 values including celebration bounds", async () => {
  const mod = await loadTokens();
  assert.deepEqual(mod.duration, EXPECTED_DURATION, "duration must match §7.2 exactly");
});

test("easing family matches the exact §7.2 cubic-bezier curves", async () => {
  const mod = await loadTokens();
  assert.deepEqual(mod.easing, EXPECTED_EASING, "easing must match §7.2 exactly");
});

test("spring family matches the exact §7.2 release spring", async () => {
  const mod = await loadTokens();
  assert.deepEqual(mod.spring, EXPECTED_SPRING, "spring must match §7.2 exactly");
});

test("elevation family is centralized with the exact §6.8 semantic levels", async () => {
  const mod = await loadTokens();
  assert.deepEqual(
    mod.elevation,
    EXPECTED_ELEVATION,
    "elevation must expose card/sheet/floating with the documented iOS/Android representations",
  );
});

test("elevation shadows are restrained (§6.8: no stacked heavy shadows)", async () => {
  const mod = await loadTokens();
  assert.ok(mod.elevation, "elevation must be defined");
  const levels = Object.values(mod.elevation);
  assert.equal(levels.length, 3, "exactly card/sheet/floating levels are defined");
  for (const level of levels) {
    assert.ok(level.ios, "every level must define an iOS shadow representation");
    assert.ok(level.android, "every level must define an Android elevation representation");
    assert.ok(
      Number.isInteger(level.android.elevation) && level.android.elevation >= 0,
      `android elevation must be a non-negative integer, got ${level.android.elevation}`,
    );
    assert.ok(
      level.ios.shadowOpacity > 0 && level.ios.shadowOpacity <= 0.2,
      `iOS shadow opacity must be restrained (0 < opacity <= 0.2), got ${level.ios.shadowOpacity}`,
    );
    assert.ok(
      level.ios.shadowRadius <= 16,
      `iOS shadow radius must be restrained (<= 16), got ${level.ios.shadowRadius}`,
    );
    const { width, height } = level.ios.shadowOffset;
    assert.ok(
      Number.isInteger(width) && Number.isInteger(height),
      "iOS shadow offset must be integer points",
    );
    assert.ok(
      Math.abs(height) <= 6,
      `iOS shadow offset must stay within ±6 points, got ${height}`,
    );
  }
});
