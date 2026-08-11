/**
 * MTS-011 contract: shared motion and haptic services.
 *
 * The reusable motion/haptic foundation must:
 *  - consume the centralized MTS-008 `duration` / `easing` / `spring` tokens
 *    (never independent raw timing constants) and expose a narrow reusable API;
 *  - represent normal vs reduced-motion behavior explicitly and map
 *    nonessential directional/decorative motion to a fade/static/immediate
 *    form while preserving essential loading and direct drag interaction
 *    (technical specification §7.4);
 *  - expose semantic, subtle haptic operations with a deterministic fake and a
 *    platform/unavailable-safe path (no crash), and introduce no interface
 *    sound (technical specification §7.5; product specification §24).
 *
 * The framework-free cores (`motion.ts`, `haptics.ts`) are compiled with the
 * repository TypeScript compiler and imported as emitted ES modules, exactly
 * like the MTS-009 primitive-core contracts, so they run deterministically
 * under `node --test` without a device animation loop.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { repoRoot, readText, walkFiles } from "../toolchain/helpers.mjs";

const MOTION_DIR = join(repoRoot, "apps", "mobile", "src", "motion");
const OUT = join(repoRoot, "apps", "mobile", "node_modules", ".mts011-motion");
const TSC = join(repoRoot, "node_modules", "typescript", "bin", "tsc");
const TOKENS_ENTRY = join(repoRoot, "packages", "design-tokens", "dist", "index.js");

/** @type {any} */ let cachedMotion;
/** @type {any} */ let cachedHaptics;
/** @type {any} */ let cachedTokens;

/** Materialize the built design-tokens entry (CI runs Typecheck before Build). */
function ensureTokensBuilt() {
  if (!existsSync(TOKENS_ENTRY)) {
    execFileSync(
      process.execPath,
      [join(repoRoot, "packages", "design-tokens", "scripts", "build.mjs")],
      { cwd: join(repoRoot, "packages", "design-tokens"), encoding: "utf8" },
    );
  }
}

/** Compile and import the framework-free motion core once per run. */
async function loadMotion() {
  if (cachedMotion === undefined) {
    ensureTokensBuilt();
    execFileSync(
      process.execPath,
      [
        TSC,
        join(MOTION_DIR, "motion.ts"),
        "--outDir",
        OUT,
        "--module",
        "esnext",
        "--moduleResolution",
        "bundler",
        "--target",
        "es2022",
        "--skipLibCheck",
        "--esModuleInterop",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    cachedMotion = await import(pathToFileURL(join(OUT, "motion.js")).href);
  }
  return cachedMotion;
}

/** Compile and import the framework-free haptic core once per run. */
async function loadHaptics() {
  if (cachedHaptics === undefined) {
    ensureTokensBuilt();
    execFileSync(
      process.execPath,
      [
        TSC,
        join(MOTION_DIR, "haptics.ts"),
        "--outDir",
        OUT,
        "--module",
        "esnext",
        "--moduleResolution",
        "bundler",
        "--target",
        "es2022",
        "--skipLibCheck",
        "--esModuleInterop",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    cachedHaptics = await import(pathToFileURL(join(OUT, "haptics.js")).href);
  }
  return cachedHaptics;
}

/** Load the built design-tokens public entry once per run. */
async function loadTokens() {
  if (cachedTokens === undefined) {
    ensureTokensBuilt();
    cachedTokens = await import(pathToFileURL(TOKENS_ENTRY).href);
  }
  return cachedTokens;
}

test("MTS-011 motion foundation boundary exists", () => {
  assert.ok(existsSync(join(MOTION_DIR, "motion.ts")), "missing motion.ts core");
  assert.ok(existsSync(join(MOTION_DIR, "haptics.ts")), "missing haptics.ts core");
});

test("motion helpers consume the centralized timing tokens, not raw constants", async () => {
  const motion = await loadMotion();
  const { duration, easing, spring } = await loadTokens();
  // Duration styles map to the approved duration tokens.
  const styleToToken = {
    instant: duration.instant,
    fast: duration.fast,
    standard: duration.standard,
    sheet: duration.sheet,
    emphasis: duration.emphasis,
  };
  for (const [style, expected] of Object.entries(styleToToken)) {
    assert.equal(motion.timingDuration(style), expected, `timingDuration(${style})`);
  }
  // Easing styles map to the approved easing tokens.
  for (const style of ["standard", "enter", "exit"]) {
    assert.deepEqual(motion.easingCurve(style), easing[style], `easingCurve(${style})`);
  }
  // Release spring maps to the approved spring tokens.
  assert.deepEqual(motion.releaseSpring(), {
    damping: spring.damping,
    stiffness: spring.stiffness,
    mass: spring.mass,
  });
});

test("motion helpers never fall back to independent raw timing constants", async () => {
  const motion = await loadMotion();
  const { duration } = await loadTokens();
  // A representative style must equal the token value, not a made-up constant.
  assert.equal(motion.timingDuration("fast"), duration.fast);
  assert.notEqual(motion.timingDuration("fast"), 100, "must not hard-code 100ms");
  assert.equal(motion.releaseSpring().damping, 22, "spring damping comes from the token");
});

test("Reduce Motion: no-preference keeps every motion class", async () => {
  const motion = await loadMotion();
  const classes = [
    "essential-loading",
    "direct-manipulation",
    "directional",
    "decorative",
    "confetti",
    "parallax",
    "moving-outline",
    "celebration",
  ];
  for (const cls of classes) {
    assert.equal(motion.resolveMotionAction("no-preference", cls), "keep", cls);
  }
});

test("Reduce Motion: nonessential motion maps to the approved reduced form", async () => {
  const motion = await loadMotion();
  // Directional movement degrades to a fade (or immediate update).
  assert.equal(motion.resolveMotionAction("reduce", "directional"), "fade");
  // Decorative/confetti/parallax/moving-outline and celebration are removed to static.
  for (const cls of ["decorative", "confetti", "parallax", "moving-outline", "celebration"]) {
    assert.equal(motion.resolveMotionAction("reduce", cls), "static", cls);
  }
});

test("Reduce Motion: essential loading and direct drag are preserved", async () => {
  const motion = await loadMotion();
  assert.equal(motion.resolveMotionAction("reduce", "essential-loading"), "keep");
  assert.equal(motion.resolveMotionAction("reduce", "direct-manipulation"), "keep");
  // The release spring survives Reduce Motion (direct manipulation is preserved).
  assert.deepEqual(motion.releaseSpring(), motion.releaseSpring());
});

test("Reduce Motion fade shortens to the instant token and uses token easing", async () => {
  const motion = await loadMotion();
  const { duration, easing } = await loadTokens();
  const normal = motion.fadeSpec("no-preference", "standard");
  const reduced = motion.fadeSpec("reduce", "standard");
  assert.deepEqual(normal.easing, easing.standard);
  assert.deepEqual(reduced.easing, easing.standard);
  assert.equal(normal.durationMs, duration.standard);
  assert.equal(reduced.durationMs, duration.instant);
  assert.ok(reduced.durationMs < normal.durationMs, "reduce motion should be faster/immediate");
});

test("haptic adapter exposes semantic operations with a deterministic fake", async () => {
  const { createHaptics, FakeHapticsAdapter } = await loadHaptics();
  const adapter = new FakeHapticsAdapter(true);
  const haptics = createHaptics(adapter);
  haptics.selection();
  haptics.snap();
  haptics.save();
  haptics.completion();
  haptics.storySave();
  haptics.destructive();
  haptics.validationFailure();
  assert.deepEqual(adapter.triggered, [
    "selection",
    "snap",
    "save",
    "completion",
    "story-save",
    "destructive",
    "validation-failure",
  ]);
  assert.equal(haptics.supported, true);
});

test("haptic adapter no-ops deterministically when unavailable (does not crash)", async () => {
  const { createHaptics, FakeHapticsAdapter } = await loadHaptics();
  const adapter = new FakeHapticsAdapter(false);
  const haptics = createHaptics(adapter);
  assert.equal(haptics.supported, false);
  haptics.selection();
  haptics.completion();
  assert.deepEqual(adapter.triggered, [], "unsupported adapter must receive no triggers");
});

test("no interface-sound path exists anywhere in the motion foundation", () => {
  const files = walkFiles(MOTION_DIR, (name) => /\.(ts|tsx)$/.test(name));
  assert.ok(files.length > 0, "motion foundation source files must exist");
  const forbidden = [
    "expo-av",
    "expo-audio",
    "playAsync",
    "Audio.Sound",
    "createAudioPlayer",
    "setAudioModeAsync",
  ];
  for (const file of files) {
    const src = readText(file);
    for (const token of forbidden) {
      assert.ok(!src.includes(token), `${file} must not reference interface sound "${token}"`);
    }
  }
});
