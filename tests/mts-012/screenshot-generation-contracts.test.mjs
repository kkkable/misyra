/**
 * MTS-012 screenshot-generation layer — RED contracts.
 *
 * The visual-regression harness shipped in the first MTS-012 correction
 * round models layouts deterministically, but the COMMANDER DIRECTIVE
 * correction (2026-08-11T19:05:20Z, issue #4 comment 5257609976) requires
 * the missing capture layer: automated tests must render the REAL MTS-009
 * primitive inventory and the REAL MTS-010 shell-screen surface in
 * headless chromium, save deterministic PNG screenshot artifacts, compare
 * them against committed platform-separated baselines, and keep every
 * baseline update explicit.
 *
 * Contracts required by this file:
 *
 *  1. the image harness exposes a deterministic capture step;
 *  2. an actual PNG screenshot artifact is captured from the real
 *     MTS-009 primitives surface (artifacts are real PNG images with the
 *     exact requested dimensions);
 *  3. an actual PNG screenshot artifact is captured from the real
 *     MTS-010 shell-screen surface;
 *  4. capture rejects unknown surfaces and non-capturable platforms
 *     (no MTS-013+ surface may be captured; no native-platform capture
 *     may pretend to be real);
 *  5. capture is byte-deterministic across repeated renders;
 *  6. the comparison step detects genuine visual differences and never
 *     reports a difference for identical captures;
 *  7. committed image baselines cover exactly the directive-required
 *     matrix — 360×800 and 412×915, light and dark, English and zh-HK,
 *     default and large text — and every baseline is a valid PNG of the
 *     right dimensions;
 *  8. image baselines are platform-separated (namespace directory +
 *     deterministic file names; nothing outside a platform directory);
 *  9. image-baseline updates stay explicit: the standalone update script
 *     is the only writer; test and capture sources never rewrite accepted
 *     baselines;
 * 10. screenshot fixture sources stay deterministic and credential-free
 *     and never smuggle in MTS-013+ behavior;
 * 11. fresh captures conform to the committed baselines within the
 *     approved tolerance on the Linux CI renderer (the canonical baseline
 *     renderer); other platforms verify structural determinism but skip
 *     pixel conformance because rasterization is platform-dependent.
 *
 * The fixture data (matrix, naming rules) ships with the RED commit; the
 * capture logic lives in `./image-harness/` and does NOT exist at the RED
 * head, so every capture-dependent contract fails with
 * ERR_MODULE_NOT_FOUND for the intended missing-layer reason.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { repoRoot, walkFiles } from "../toolchain/helpers.mjs";
import {
  IMAGE_BASELINE_PLATFORMS,
  IMAGE_SIZES,
  IMAGE_SURFACES,
  imageBaselineName,
  requiredImageCombos,
} from "./fixtures/image-frames.mjs";

const IMAGE_HARNESS_ENTRY = "./image-harness/capture.mjs";
const IMAGE_BASELINES_DIR = join(repoRoot, "tests", "mts-012", "image-baselines");
const MTS_012_DIR = join(repoRoot, "tests", "mts-012");
const IMAGE_HARNESS_DIR = join(MTS_012_DIR, "image-harness");

/** @type {Promise<any> | undefined} */
// Dynamic module (repo convention: real-module loads typed `any`; the
// image harness module itself is fully type-checked by root tsc).
let imageHarnessPromise;

/** Load the image harness entry; at the RED head this rejects (module missing). */
function loadImageHarness() {
  imageHarnessPromise ??= import(IMAGE_HARNESS_ENTRY);
  return imageHarnessPromise ?? Promise.reject(new Error("image harness module unavailable"));
}

// Release the chromium + loopback-server environment so this test process
// can exit cleanly after all contracts ran.
after(async () => {
  try {
    const h = await loadImageHarness();
    if (typeof h.closeCaptureEnvironment === "function") {
      await h.closeCaptureEnvironment();
    }
  } catch {
    // No harness loaded (RED head or load failure) — nothing to release.
  }
});

/** The reference combo used by the smoke and sensitivity contracts. */
function referenceCombo(overrides = {}) {
  return {
    surface: "primitives",
    platform: "web",
    width: 360,
    height: 800,
    appearance: "light",
    locale: "en",
    textScale: 1,
    ...overrides,
  };
}

/**
 * Assert `buffer` is a PNG and return its pixel dimensions (width/height
 * from the IHDR chunk, big-endian at byte offsets 16/20).
 * @param {Buffer} buffer
 * @param {string} label
 */
function pngDimensions(buffer, label) {
  assert.ok(Buffer.isBuffer(buffer), `${label} must be a Buffer`);
  assert.ok(buffer.length >= 24, `${label} must be at least an IHDR-sized PNG`);
  assert.deepEqual(
    [...buffer.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    `${label} must start with the PNG magic bytes`,
  );
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * Read a required combo by baseline file name, failing with a precise
 * message when the committed inventory does not contain it.
 * @param {{ surface: string; width: number; height: number; appearance: string; locale: string; textScale: number }[]} required
 * @param {string} entry
 */
function findRequired(required, entry) {
  const combo = required.find((c) => imageBaselineName(c) === entry);
  if (!combo) {
    throw new Error(`unexpected image baseline file: ${entry}`);
  }
  return combo;
}

test("the image harness exposes a deterministic capture step", async () => {
  const h = await loadImageHarness();
  assert.equal(typeof h.captureScreenshot, "function", "captureScreenshot must be exported");
  const pending = h.captureScreenshot(referenceCombo());
  assert.equal(
    typeof pending.then,
    "function",
    "captureScreenshot must return a promise of the captured PNG artifact",
  );
  const shot = await pending;
  assert.ok(Buffer.isBuffer(shot), "the promise must resolve to the PNG buffer");
});

test("an actual PNG screenshot artifact is captured from the real MTS-009 primitives surface", async () => {
  const h = await loadImageHarness();
  const combo = referenceCombo();
  const shot = await h.captureScreenshot(combo);
  const meta = pngDimensions(shot, "primitives screenshot");
  assert.equal(meta.width, combo.width, "primitives screenshot width must match the device width");
  assert.equal(
    meta.height,
    combo.height,
    "primitives screenshot height must match the device height",
  );
});

test("an actual PNG screenshot artifact is captured from the real MTS-010 shell-screen surface", async () => {
  const h = await loadImageHarness();
  const combo = referenceCombo({
    surface: "shell-screen",
    width: 412,
    height: 915,
    appearance: "light",
    locale: "zh-HK",
  });
  const shot = await h.captureScreenshot(combo);
  const meta = pngDimensions(shot, "shell-screen screenshot");
  assert.equal(
    meta.width,
    combo.width,
    "shell-screen screenshot width must match the device width",
  );
  assert.equal(
    meta.height,
    combo.height,
    "shell-screen screenshot height must match the device height",
  );
});

test("capture rejects unknown surfaces and non-capturable platforms", async () => {
  const h = await loadImageHarness();
  assert.deepEqual(
    [...h.capturableSurfaces].sort(),
    [...IMAGE_SURFACES].sort(),
    "the capturable surface set must be exactly the approved MTS-012 set",
  );
  await assert.rejects(
    h.captureScreenshot(referenceCombo({ surface: "settings-screen" })),
    /unknown surface|not an approved surface/i,
    "an MTS-013+ surface must be rejected, never captured",
  );
  await assert.rejects(
    h.captureScreenshot(referenceCombo({ platform: "ios" })),
    /cannot be captured|capturable platform/i,
    "a native-platform capture must be rejected (no native simulator in this harness)",
  );
  await assert.rejects(
    h.captureScreenshot(referenceCombo({ platform: "android" })),
    /cannot be captured|capturable platform/i,
    "a native-platform capture must be rejected (no native simulator in this harness)",
  );
});

test("capture is byte-deterministic across repeated renders", async () => {
  const h = await loadImageHarness();
  const first = await h.captureScreenshot(referenceCombo());
  const second = await h.captureScreenshot(referenceCombo());
  assert.deepEqual(
    first,
    second,
    "two captures of the identical combo must be byte-identical (deterministic fixtures)",
  );
});

test("the comparison step detects genuine visual differences and never false-positives", async () => {
  const h = await loadImageHarness();
  assert.equal(typeof h.compareShots, "function", "compareShots must be exported");
  const light = await h.captureScreenshot(referenceCombo({ appearance: "light" }));
  const dark = await h.captureScreenshot(referenceCombo({ appearance: "dark" }));
  const differing = h.compareShots(light, dark);
  assert.ok(
    differing > 0.001,
    `light vs dark must differ visually (diff ratio ${differing.toFixed(4)})`,
  );
  assert.ok(differing < 1, "diff ratio must be below 1");
  const same = h.compareShots(light, light);
  assert.equal(same, 0, "identical captures must have diff ratio exactly 0");
});

test("committed image baselines cover exactly the directive-required capture matrix", async () => {
  const required = requiredImageCombos();
  assert.equal(required.length, 24, "primitives (16) + shell-screen light (8) = 24 baselines");
  const sizes = new Set(IMAGE_SIZES.map((s) => `${s.width}x${s.height}`));
  assert.deepEqual([...sizes].sort(), ["360x800", "412x915"], "both directive-minimum sizes");
  const appearances = new Set(required.map((c) => c.appearance));
  assert.ok(appearances.has("light") && appearances.has("dark"), "light AND dark must be covered");
  const locales = new Set(required.map((c) => c.locale));
  assert.ok(locales.has("en") && locales.has("zh-HK"), "English AND zh-HK must be covered");
  const scales = new Set(required.map((c) => c.textScale));
  assert.ok(scales.has(1) && scales.has(2), "default AND large text must be covered");
  for (const surface of IMAGE_SURFACES) {
    assert.ok(
      required.some((c) => c.surface === surface),
      `surface ${surface} must have at least one baseline`,
    );
  }

  let found = 0;
  for (const platform of IMAGE_BASELINE_PLATFORMS) {
    const dir = join(IMAGE_BASELINES_DIR, platform);
    /** @type {string[]} */
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      const file = join(dir, entry);
      const combo = findRequired(required, entry);
      const meta = pngDimensions(readFileSync(file), `${platform}/${entry}`);
      assert.equal(meta.width, combo.width, `${entry} width`);
      assert.equal(meta.height, combo.height, `${entry} height`);
      const bytes = statSync(file).size;
      assert.ok(bytes >= 500, `${entry} must be a real captured screenshot (got ${bytes} bytes)`);
      assert.ok(
        bytes <= 2 * 1024 * 1024,
        `${entry} must stay within the expected screenshot size band (got ${bytes} bytes)`,
      );
      found += 1;
    }
  }
  assert.equal(found, required.length, "every required baseline must be committed");
});

test("image baselines are platform-separated and deterministically named", async () => {
  const required = requiredImageCombos();
  /** @type {string[] | undefined} */
  let rootEntries;
  try {
    rootEntries = readdirSync(IMAGE_BASELINES_DIR);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      assert.fail("image-baselines directory must exist with platform-separated baselines");
    }
    throw error;
  }
  for (const entry of rootEntries) {
    const stat = statSync(join(IMAGE_BASELINES_DIR, entry));
    if (!stat.isDirectory()) {
      assert.fail(`image baseline ${entry} must live inside a platform directory`);
    }
  }
  assert.deepEqual(
    [...rootEntries].sort(),
    [...IMAGE_BASELINE_PLATFORMS].sort(),
    "the baselines root must contain exactly the approved platform namespaces",
  );
  // Every required baseline must exist under an approved platform
  // namespace; the naming rule must embed surface/dims/appearance/locale/
  // scale so baselines are self-describing and cross-platform comparison
  // is structurally impossible (platform lives in the directory, not the
  // pixels).
  for (const combo of required) {
    let placed = false;
    for (const platform of IMAGE_BASELINE_PLATFORMS) {
      const file = join(IMAGE_BASELINES_DIR, platform, imageBaselineName(combo));
      let stat;
      try {
        stat = statSync(file);
      } catch {
        continue;
      }
      if (stat.isFile()) placed = true;
    }
    assert.ok(
      placed,
      `baseline ${imageBaselineName(combo)} must exist under an approved platform namespace`,
    );
    const name = imageBaselineName(combo);
    assert.ok(name.startsWith(`${combo.surface}-`), `${name}: surface part`);
    assert.ok(name.includes(`${combo.width}x${combo.height}-`), `${name}: size part`);
    assert.ok(name.includes(`${combo.appearance}-`), `${name}: appearance part`);
    assert.ok(name.includes(`${combo.locale}-`), `${name}: locale part`);
    assert.ok(name.endsWith(`-${combo.textScale}x.png`), `${name}: text-scale part`);
  }
});

test("image-baseline updates stay explicit — tests never rewrite accepted baselines", async () => {
  const h = await loadImageHarness();
  // (a) The explicit update workflow must exist as a standalone script and
  // drive the capture step.
  const updateScript = join(MTS_012_DIR, "update-image-baselines.mjs");
  const script = readFileSync(updateScript, "utf8");
  assert.match(script, /image-harness/, "the update script must drive the capture step");
  assert.match(
    script,
    new RegExp(["image", "baselines"].join("-")),
    "the update script must target the image-baselines directory",
  );
  // (b) No *test* or capture source may write baselines; only the explicit
  // update script may. NOTE: assembled from split parts so this guard never
  // matches its own source.
  const writeTargetPattern = new RegExp(
    ["writ", "eFile", "Sync"].join("") +
      "|" +
      ["appen", "dFile", "Sync"].join("") +
      "|" +
      ["create", "Write", "Stream"].join("") +
      "|" +
      ["copy", "File", "Sync"].join(""),
  );
  const guardedFiles = walkFiles(IMAGE_HARNESS_DIR, (name) => name.endsWith(".mjs"));
  guardedFiles.push("tests/mts-012/screenshot-generation-contracts.test.mjs");
  for (const rel of guardedFiles) {
    const source = readFileSync(join(repoRoot, rel), "utf8");
    assert.ok(
      !writeTargetPattern.test(source),
      `${rel} must never write files (image-baseline updates must stay explicit)`,
    );
  }
  // (c) The capture step must be comparison-capable but never persist.
  assert.equal(typeof h.compareShots, "function");
});

test("screenshot fixture sources are deterministic, credential-free, and MTS-013-free", async () => {
  // Screenshots may only ever contain deterministic placeholder content:
  // no credentials, tokens, private keys, or device/native runtime data.
  const secretPattern =
    /sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
  // E02-domain vocabulary must not appear in the image layer (the audit
  // contract routes those features to their own tickets).
  const forbidden = [
    "mission",
    "series",
    "occurrence",
    "recurrence",
    "streak",
    "reward",
    "eligibility",
    "retention",
  ];
  const sources = walkFiles(IMAGE_HARNESS_DIR, (name) => /\.(mjs|tsx|ts|html)$/.test(name));
  assert.ok(sources.length >= 1, "expected the image-harness sources to exist");
  for (const rel of [...sources, "tests/mts-012/update-image-baselines.mjs"]) {
    const source = readFileSync(join(repoRoot, rel), "utf8");
    assert.ok(!secretPattern.test(source), `${rel} must not contain credential/secret patterns`);
    for (const term of forbidden) {
      assert.ok(
        !source.toLowerCase().includes(term),
        `${rel} must not contain MTS-013+ feature vocabulary ("${term}")`,
      );
    }
  }
});

test(
  "fresh screenshots conform to the committed baselines (Linux renderer)",
  { skip: process.platform === "win32" || process.platform === "darwin" },
  async () => {
    // The committed baselines are rendered by the Linux CI chromium. On
    // Linux this contract re-captures every combo and compares pixels:
    // genuine visual drift fails the gate. Other platforms skip pixel
    // conformance (rasterization differs by platform) but still verify
    // structural determinism through contracts 1-10.
    const h = await loadImageHarness();
    const tolerance = 0.02;
    const required = requiredImageCombos();
    for (const combo of required) {
      const fresh = await h.captureScreenshot({ ...combo, platform: "web" });
      const baselinePath = join(IMAGE_BASELINES_DIR, "web", imageBaselineName(combo));
      const baseline = readFileSync(baselinePath);
      const ratio = h.compareShots(fresh, baseline);
      assert.ok(
        ratio <= tolerance,
        `${imageBaselineName(combo)} drifted ${(ratio * 100).toFixed(2)}% from its committed baseline (tolerance ${(tolerance * 100).toFixed(0)}%)`,
      );
    }
  },
);
