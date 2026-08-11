/**
 * MTS-011 correction contract: real Expo haptics adapter platform semantics.
 *
 * The real adapter boundary (`apps/mobile/src/motion/expo-haptics.ts`) must:
 *  - be platform-aware: on Android use the action-oriented system-haptic path
 *    (`ExpoHaptics.performAndroidHapticsAsync` + `AndroidHaptics` semantic
 *    constants) that honors the user's system touch-feedback setting, instead
 *    of the Android `Vibrator`-backed `impactAsync`/`notificationAsync`
 *    simulation (technical specification §7.5: "Respect system haptic
 *    settings");
 *  - on iOS retain the subtle Expo selection/impact/notification APIs;
 *  - never throw and never block callers: rejection/unavailability is a
 *    silent no-op (fire-and-forget with no unhandled rejection);
 *  - expose truthful synchronous availability semantics (platform capability
 *    derived from the platform, never an unconditional `supported: true`
 *    claim of runtime availability);
 *  - keep the deterministic fake/no-op adapter paths available for tests and
 *    unsupported environments;
 *  - introduce no raw vibration patterns, `Vibrator` calls, audio, or a
 *    separate haptic setting.
 *
 * The real `expo-haptics` native module cannot be imported under plain Node
 * (its source under node_modules is not type-strippable), so the adapter
 * boundary is exercised through its injectable factory (provider + platform)
 * — the exact production code path — and the thin native wiring module is
 * verified structurally against the installed SDK 57 API surface.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { fileExists, repoRoot, readText, walkFiles } from "../toolchain/helpers.mjs";

const MOTION_DIR = join(repoRoot, "apps", "mobile", "src", "motion");
const OUT = join(repoRoot, "apps", "mobile", "node_modules", ".mts011-real-adapter");
const TSC = join(repoRoot, "node_modules", "typescript", "bin", "tsc");
const HAPTICS_DTS = "apps/mobile/node_modules/expo-haptics/build/Haptics.types.d.ts";

/** @type {any} */ let cachedAdapter;

/** Compile and import the real-adapter boundary module once per run. */
async function loadRealAdapter() {
  if (cachedAdapter === undefined) {
    execFileSync(
      process.execPath,
      [
        TSC,
        join(MOTION_DIR, "expo-haptics.ts"),
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
    cachedAdapter = await import(pathToFileURL(join(OUT, "expo-haptics.js")).href);
  }
  return cachedAdapter;
}

/** Deterministic fake provider recording every expo-haptics call. */
function makeFakeProvider({ reject = false } = {}) {
  /** @type {Array<[string, ...unknown[]]>} */
  const calls = [];
  const record = (name) =>
    (...args) => {
      calls.push([name, ...args]);
      return reject
        ? Promise.reject(new Error(`simulated ${name} unavailability`))
        : Promise.resolve();
    };
  return {
    calls,
    provider: {
      selectionAsync: record("selectionAsync"),
      impactAsync: record("impactAsync"),
      notificationAsync: record("notificationAsync"),
      performAndroidHapticsAsync: record("performAndroidHapticsAsync"),
    },
  };
}

const INTENTS = [
  "selection",
  "snap",
  "save",
  "completion",
  "story-save",
  "destructive",
  "validation-failure",
];

test("real adapter module exports a platform-aware factory", async () => {
  const adapter = await loadRealAdapter();
  assert.equal(
    typeof adapter.createExpoHapticsAdapter,
    "function",
    "expo-haptics.ts must export createExpoHapticsAdapter(platform, provider)",
  );
});

test("Android: every semantic intent maps to performAndroidHapticsAsync with subtle AndroidHaptics constants", async () => {
  const adapter = await loadRealAdapter();
  const { provider, calls } = makeFakeProvider();
  const real = adapter.createExpoHapticsAdapter("android", provider);
  for (const intent of INTENTS) {
    real.trigger(intent);
  }
  assert.deepEqual(
    calls.map(([name, ...args]) => [name, ...args]),
    [
      ["performAndroidHapticsAsync", "segment-tick"], // selection: discrete choice tick
      ["performAndroidHapticsAsync", "segment-frequent-tick"], // snap: very soft drag detent tick
      ["performAndroidHapticsAsync", "confirm"], // save: successful interaction
      ["performAndroidHapticsAsync", "confirm"], // completion: successful interaction
      ["performAndroidHapticsAsync", "confirm"], // story-save: successful interaction
      ["performAndroidHapticsAsync", "reject"], // destructive: negative/irreversible action
      ["performAndroidHapticsAsync", "reject"], // validation-failure: rejection
    ],
    "Android must use only the action-oriented system-haptic API",
  );
  const used = new Set(calls.map(([name]) => name));
  assert.deepEqual(
    [...used],
    ["performAndroidHapticsAsync"],
    "Android path must never use the Vibrator-backed selection/impact/notification APIs",
  );
});

test("Android: all AndroidHaptics constants used are real SDK 57 enum values", () => {
  assert.ok(fileExists(HAPTICS_DTS), `installed expo-haptics type surface missing: ${HAPTICS_DTS}`);
  const dts = readText(HAPTICS_DTS);
  const section = dts.match(/export declare enum AndroidHaptics \{([\s\S]*?)\}/);
  assert.ok(section, "expo-haptics SDK must declare the AndroidHaptics enum");
  const sdkValues = new Set(
    [...section[1].matchAll(/(\w+)\s*=\s*"([^"]+)"/g)].map((m) => m[2]),
  );
  for (const constant of [
    "segment-tick",
    "segment-frequent-tick",
    "confirm",
    "reject",
  ]) {
    assert.ok(
      sdkValues.has(constant),
      `AndroidHaptics constant "${constant}" must exist in the installed SDK 57 enum`,
    );
  }
});

test("iOS: semantic intents retain the subtle selection/impact/notification APIs", async () => {
  const adapter = await loadRealAdapter();
  const { provider, calls } = makeFakeProvider();
  const real = adapter.createExpoHapticsAdapter("ios", provider);
  for (const intent of INTENTS) {
    real.trigger(intent);
  }
  assert.deepEqual(
    calls.map(([name, ...args]) => [name, ...args]),
    [
      ["selectionAsync"], // selection
      ["impactAsync", "light"], // snap
      ["impactAsync", "light"], // save
      ["impactAsync", "medium"], // completion
      ["selectionAsync"], // story-save
      ["impactAsync", "medium"], // destructive
      ["notificationAsync", "error"], // validation-failure
    ],
    "iOS must keep the reviewed subtle selection/impact/notification mapping",
  );
  const used = new Set(calls.map(([name]) => name));
  assert.ok(
    !used.has("performAndroidHapticsAsync"),
    "iOS must not use the Android-only API",
  );
});

test("real adapter rejection/unavailability is a silent no-op and cannot crash the caller", async () => {
  const adapter = await loadRealAdapter();
  const { provider } = makeFakeProvider({ reject: true });
  const real = adapter.createExpoHapticsAdapter("android", provider);
  for (const intent of INTENTS) {
    let threw = false;
    try {
      const result = real.trigger(intent);
      assert.equal(result, undefined, "trigger must be fire-and-forget (void)");
    } catch {
      threw = true;
    }
    assert.equal(threw, false, `trigger(${intent}) must never throw`);
  }
  // Give the rejected promises a chance to surface: if the adapter did not
  // swallow them, node:test fails this file with an unhandled rejection.
  await new Promise((resolve) => setImmediate(resolve));
});

test("real adapter availability is platform-derived, never an unconditional supported: true", async () => {
  const adapter = await loadRealAdapter();
  const { provider } = makeFakeProvider();
  assert.equal(adapter.createExpoHapticsAdapter("android", provider).supported, true);
  assert.equal(adapter.createExpoHapticsAdapter("ios", provider).supported, true);
  for (const platform of ["web", "windows", "macos", "unknown"]) {
    assert.equal(
      adapter.createExpoHapticsAdapter(platform, provider).supported,
      false,
      `supported must be false on ${platform}`,
    );
  }
});

test("real adapter source references the system-haptic API and no unconditional supported flag", () => {
  const src = readText(join(MOTION_DIR, "expo-haptics.ts"));
  assert.ok(
    src.includes("performAndroidHapticsAsync"),
    "expo-haptics.ts must route Android feedback through performAndroidHapticsAsync",
  );
  assert.ok(
    !src.includes("supported: true"),
    "expo-haptics.ts must not claim unconditional availability",
  );
});

test("native wiring module binds the factory to Platform.OS and the real Expo provider", () => {
  const wiring = join(MOTION_DIR, "expo-haptics-native.ts");
  assert.ok(existsSync(wiring), "missing expo-haptics-native.ts wiring module");
  const src = readText(wiring);
  assert.ok(src.includes("Platform.OS"), "wiring must derive the platform from Platform.OS");
  assert.ok(
    src.includes("createExpoHapticsAdapter"),
    "wiring must construct the adapter through the platform-aware factory",
  );
  assert.ok(
    src.includes("ExpoHaptics.AndroidHaptics"),
    "wiring must cast Android constants to the real ExpoHaptics.AndroidHaptics enum",
  );
  assert.ok(
    src.includes("performAndroidHapticsAsync"),
    "wiring must bind the real performAndroidHapticsAsync",
  );
  assert.ok(!src.includes("supported: true"), "wiring must not claim unconditional availability");
});

test("real adapter boundary introduces no raw vibration, Vibrator, or audio path", () => {
  const files = walkFiles(MOTION_DIR, (name) => /\.[jt]sx?$/.test(name));
  assert.ok(files.length > 0, "motion foundation source files must exist");
  const forbidden = [
    "expo-av",
    "expo-audio",
    "playAsync",
    "Audio.Sound",
    "createAudioPlayer",
    "setAudioModeAsync",
    "Vibrator",
    "vibrationAsync",
  ];
  for (const file of files) {
    const src = readText(file);
    for (const token of forbidden) {
      assert.ok(
        !src.includes(token),
        `${file} must not reference forbidden haptic/audio API "${token}"`,
      );
    }
  }
});
