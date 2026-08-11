/**
 * MTS-012 RED contracts: the visual-regression / device-size harness.
 *
 * These contracts define what the MTS-012 harness MUST provide before any
 * implementation exists (COMMANDER DIRECTIVE 2026-08-11T15:27:56Z):
 *
 *  1. enumerate all four approved portrait phone sizes (§6.2: 360×800,
 *     390×844, 393×852, 412×915) with deterministic safe-area insets;
 *  2. cover light and dark appearance, English and zh-HK, and large text;
 *  3. render/inspect representative MTS-009 primitives plus the MTS-010
 *     four-tab shell into a deterministic, credential-free layout manifest
 *     (the "screenshot-like" fixture) for every approved combination;
 *  4. fail on an intentional visual/layout mismatch instead of silently
 *     accepting it, and report the exact changed path;
 *  5. keep baseline updates explicit (update script only; normal test runs
 *     must never rewrite accepted baselines);
 *  6. enforce safe-area / gesture-area, bottom-navigation, text-wrapping,
 *     and touch-target (≥ 44 pt) contracts at every approved size;
 *  7. prove the shell is portrait-phone responsive (width-constrained, no
 *     fixed-canvas scaling) and that no tablet/landscape layout is
 *     introduced;
 *  8. represent selected/unselected tab states distinctly;
 *  9. never implement or snapshot MTS-013+ feature behavior.
 *
 * The fixture data (device frames, matrices, model constants) ships with the
 * RED commit; the harness logic lives in `./harness/` and does NOT exist at
 * the RED head, so every harness-dependent contract fails with
 * ERR_MODULE_NOT_FOUND for the intended missing-harness reason.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { repoRoot, walkFiles } from "../toolchain/helpers.mjs";
import {
  APPEARANCES,
  DEVICE_FRAMES,
  LOCALES,
  PLATFORMS,
  REFERENCE_FRAME,
  TEXT_SCALES,
} from "./fixtures/device-frames.mjs";

const HARNESS_ENTRY = "./harness/manifest.mjs";
const BASELINES_DIR = join(repoRoot, "tests", "mts-012", "baselines");
const MTS_012_DIR = join(repoRoot, "tests", "mts-012");

/** @type {Promise<typeof import("./harness/manifest.mjs")> | undefined} */
let harnessPromise;

/** Load the harness entry; at the RED head this rejects (module missing). */
function loadHarness() {
  harnessPromise ??= import(HARNESS_ENTRY);
  return harnessPromise;
}

/** Every approved platform × size × appearance × locale × text-scale combo. */
function allCombos() {
  const combos = [];
  for (const platform of PLATFORMS) {
    for (const frame of Object.values(DEVICE_FRAMES)) {
      for (const appearance of APPEARANCES) {
        for (const locale of LOCALES) {
          for (const textScale of TEXT_SCALES) {
            combos.push({ platform, device: frame, appearance, locale, textScale });
          }
        }
      }
    }
  }
  return combos;
}

test("device fixtures enumerate the four approved portrait phone sizes", () => {
  const frames = Object.values(DEVICE_FRAMES);
  const dims = frames.map((f) => `${f.width}x${f.height}`);
  assert.deepEqual(
    [...dims].sort(),
    ["360x800", "390x844", "393x852", "412x915"],
    "the harness must enumerate exactly the four approved §6.2 phone sizes",
  );
  for (const frame of frames) {
    assert.ok(
      frame.width < frame.height,
      `${frame.id} must be a portrait frame (width ${frame.width} < height ${frame.height})`,
    );
  }
});

test("device fixtures are deterministic and carry per-platform safe-area insets", () => {
  const frames = Object.values(DEVICE_FRAMES);
  assert.ok(frames.length > 0);
  for (const frame of frames) {
    assert.ok(Number.isFinite(frame.width) && Number.isFinite(frame.height));
    for (const platform of PLATFORMS) {
      const insets = frame.insets[platform];
      assert.ok(insets, `frame ${frame.id} must define insets for ${platform}`);
      assert.ok(Number.isFinite(insets.top) && insets.top > 0, `${frame.id} ${platform} top inset`);
      assert.ok(
        Number.isFinite(insets.bottom) && insets.bottom > 0,
        `${frame.id} ${platform} bottom inset`,
      );
      assert.ok(Number.isFinite(insets.left) && insets.left >= 0);
      assert.ok(Number.isFinite(insets.right) && insets.right >= 0);
    }
    assert.ok(
      frame.width <= 412 && frame.height <= 915,
      `${frame.id} must stay within the approved phone range (no tablet frame)`,
    );
  }
  assert.ok(
    Object.hasOwn(DEVICE_FRAMES, REFERENCE_FRAME),
    `the design reference frame ${REFERENCE_FRAME} must be part of the matrix`,
  );
});

test("fixture matrix covers light/dark appearance, English/zh-HK, and large text", () => {
  assert.deepEqual(APPEARANCES, ["light", "dark"], "both appearance modes must be represented");
  assert.ok(LOCALES.includes("en"), "English must be represented");
  assert.ok(LOCALES.includes("zh-HK"), "zh-HK must be represented");
  assert.ok(
    TEXT_SCALES.includes(2),
    "large text (textScale ≥ 2) must be included in the fixtures",
  );
  assert.ok(TEXT_SCALES.includes(1), "normal text scale must be included");
});

test("the harness renders a deterministic manifest for every approved combination", async () => {
  const h = await loadHarness();
  const combos = allCombos();
  assert.ok(combos.length >= 64, `expected the full approved matrix, got ${combos.length}`);
  for (const surface of ["shell", "primitives"]) {
    for (const combo of combos) {
      const first = h.buildManifest(surface, combo);
      const second = h.buildManifest(surface, combo);
      assert.ok(first && typeof first === "object", `${surface} manifest must be an object`);
      assert.ok(first.schema >= 1, `${surface} manifest must declare a schema version`);
      assert.equal(first.surface, surface);
      assert.equal(first.platform, combo.platform);
      assert.equal(first.locale, combo.locale);
      assert.equal(first.textScale, combo.textScale);
      assert.deepEqual(
        first,
        second,
        `${surface} manifest for ${combo.platform}|${combo.device.id}|${combo.appearance}|${combo.locale}|${combo.textScale} must be deterministic (identical across renders)`,
      );
    }
  }
});

test("the shell manifest respects safe-area and gesture-area boundaries", async () => {
  const h = await loadHarness();
  for (const combo of allCombos()) {
    const m = h.buildManifest("shell", combo);
    const layout = m.layout;
    assert.equal(
      layout.safeArea.top,
      combo.device.insets[combo.platform].top,
      "content must start inside the top safe-area inset",
    );
    const bar = layout.tabBar;
    assert.ok(bar.aboveGestureArea, "the bottom tab bar must sit above the gesture area");
    assert.ok(
      bar.y + bar.height <= combo.device.height - combo.device.insets[combo.platform].bottom,
      `tab bar must stay above the bottom inset at ${combo.device.id} (${combo.platform})`,
    );
    assert.equal(
      layout.contentWidth,
      combo.device.width - 2 * layout.screenPadding,
      "content width must be width-constrained by the approved screen padding",
    );
  }
});

test("touch targets stay ≥ 44 pt at every size, appearance, locale, and text scale", async () => {
  const h = await loadHarness();
  for (const combo of allCombos()) {
    const shell = h.buildManifest("shell", combo);
    const primitives = h.buildManifest("primitives", combo);
    const minTarget = primitives.layout.tokens.minTouchTarget;
    assert.ok(
      minTarget >= 44,
      `the harness must carry the real MTS-009 minimum touch target (got ${minTarget})`,
    );
    const slots = [];
    for (const tab of shell.layout.tabs) {
      slots.push({ name: `tab:${tab.route}`, width: tab.width, height: tab.height });
    }
    for (const [name, spec] of Object.entries(primitives.layout.primitives)) {
      if (spec.minWidth !== undefined) slots.push({ name, width: spec.minWidth, height: spec.minHeight });
    }
    assert.ok(slots.length >= 5, "the harness must model at least five interactive slots");
    for (const slot of slots) {
      assert.ok(
        slot.width >= minTarget && slot.height >= minTarget,
        `interactive slot ${slot.name} must be ≥ ${minTarget}×${minTarget} pt at ` +
          `${combo.platform}|${combo.device.id}|${combo.appearance}|${combo.locale}|${combo.textScale} ` +
          `(got ${slot.width}×${slot.height})`,
      );
    }
  }
});

test("text wraps rather than clipping at every approved size and text scale", async () => {
  const h = await loadHarness();
  for (const combo of allCombos()) {
    const m = h.buildManifest("shell", combo);
    const layout = m.layout;
    for (const tab of layout.tabs) {
      assert.ok(tab.labelLines >= 1, `tab ${tab.route} must have at least one label line`);
      assert.ok(
        tab.labelFits,
        `tab ${tab.route} label must wrap to fit its tab width at ` +
          `${combo.device.id}/${combo.locale}/scale ${combo.textScale} ` +
          `(lines ${tab.labelLines}, widths [${tab.labelLineWidths.join(", ")}] vs width ${tab.width})`,
      );
    }
    assert.ok(
      layout.screen.bodyFits,
      `placeholder body must fit its vertical budget at ${combo.device.id}/${combo.locale}/` +
        `scale ${combo.textScale} (required ${layout.screen.bodyRequiredHeight}pt vs available ${layout.screen.availableHeight}pt)`,
    );
    assert.ok(
      layout.screen.bodyLines >= 1 && layout.screen.titleLines >= 1,
      "screen title and body must render at least one line",
    );
    for (const modal of layout.modals) {
      assert.ok(
        modal.bodyFits,
        `modal ${modal.route} body must fit at ${combo.device.id}/${combo.locale}/scale ${combo.textScale}`,
      );
    }
  }
});

test("the visual-regression gate fails on an intentional mismatch and reports the exact path", async () => {
  const h = await loadHarness();
  const combo = {
    platform: "ios",
    device: DEVICE_FRAMES[REFERENCE_FRAME],
    appearance: "light",
    locale: "en",
    textScale: 1,
  };
  const baseline = h.buildManifest("shell", combo);
  const mutated = structuredClone(baseline);
  mutated.layout.tabBar.height = 99;
  const diffs = h.compareManifest(mutated.layout, baseline.layout);
  assert.ok(
    diffs.length >= 1,
    "an intentional layout mismatch must produce at least one diff entry",
  );
  assert.ok(
    diffs.some((d) => d.path === "tabBar.height"),
    `the diff must report the exact changed path "tabBar.height", got: ${diffs
      .map((d) => d.path)
      .join(", ")}`,
  );
  for (const diff of diffs) {
    assert.ok("path" in diff && "expected" in diff && "actual" in diff);
  }
  assert.throws(
    () => h.assertManifestsEqual(mutated.layout, baseline.layout, "shell@393x852"),
    /tabBar\.height/,
    "assertManifestsEqual must throw with the changed path on mismatch — never silently accept",
  );
});

test("baseline inventory covers the full approved matrix and nothing else", async () => {
  const h = await loadHarness();
  const combos = allCombos();
  for (const surface of ["shell", "primitives"]) {
    const file = join(BASELINES_DIR, `${surface}.json`);
    const baseline = JSON.parse(readFileSync(file, "utf8"));
    assert.ok(baseline.schema >= 1, `${surface} baseline must declare a schema version`);
    assert.equal(baseline.surface, surface);
    const keys = Object.keys(baseline.combos);
    const expected = combos.map((c) => h.comboKey(c));
    assert.deepEqual(
      [...keys].sort(),
      [...expected].sort(),
      `${surface} baseline must cover exactly the full approved matrix`,
    );
    for (const key of keys) {
      assert.ok(
        baseline.combos[key] && typeof baseline.combos[key] === "object",
        `baseline entry ${surface}:${key} must be a manifest layout object`,
      );
    }
  }
});

test("normal test execution never rewrites accepted baselines (baseline-update guard)", async () => {
  const h = await loadHarness();
  // (a) The accepted baselines must still equal a fresh deterministic render.
  for (const surface of ["shell", "primitives"]) {
    const file = join(BASELINES_DIR, `${surface}.json`);
    const baseline = JSON.parse(readFileSync(file, "utf8"));
    for (const combo of allCombos()) {
      const fresh = h.buildManifest(surface, combo);
      h.assertManifestsEqual(fresh.layout, baseline.combos[h.comboKey(combo)], `${surface}`);
    }
  }
  // (b) No *test* file may write baselines; only the explicit update script may.
  const testFiles = walkFiles(MTS_012_DIR, (name) => name.endsWith(".test.mjs"));
  assert.ok(testFiles.length >= 1, "expected at least one MTS-012 test file");
  for (const rel of testFiles) {
    const source = readFileSync(join(repoRoot, rel), "utf8");
    assert.ok(
      !/writeFileSync|appendFileSync|createWriteStream/.test(source),
      `${rel} must never write files (baseline updates must stay explicit)`,
    );
  }
  // (c) The explicit update workflow must exist as a standalone script.
  const updateScript = join(MTS_012_DIR, "update-baselines.mjs");
  const script = readFileSync(updateScript, "utf8");
  assert.match(script, /writeFileSync/, "update-baselines.mjs must be the explicit baseline writer");
  assert.match(script, /baselines/, "update-baselines.mjs must target the baselines directory");
});

test("the harness stays responsive rather than scaling a fixed canvas", async () => {
  const h = await loadHarness();
  const widths = [];
  for (const frame of Object.values(DEVICE_FRAMES)) {
    const m = h.buildManifest("shell", {
      platform: "ios",
      device: frame,
      appearance: "light",
      locale: "en",
      textScale: 1,
    });
    widths.push(m.layout.contentWidth);
  }
  assert.deepEqual(
    [...widths].sort((a, b) => a - b),
    widths,
    "content width must vary with device width (width-constrained layout)",
  );
  for (const combo of allCombos()) {
    const m = h.buildManifest("shell", combo);
    assert.equal(
      m.layout.contentWidth,
      combo.device.width - 2 * m.layout.screenPadding,
      "content must be width-constrained by padding, never a fixed screenshot width",
    );
    const json = JSON.stringify(m.layout);
    assert.ok(
      !/"scale"/.test(json),
      "the shell manifest must not introduce a scale-to-fit transform",
    );
  }
  // No scale-to-fit transforms anywhere in the mobile app sources.
  const appSources = walkFiles(
    join(repoRoot, "apps", "mobile", "app"),
    (name) => /\.tsx?$/.test(name),
  );
  for (const rel of appSources) {
    const source = readFileSync(join(repoRoot, rel), "utf8");
    assert.ok(
      !/scale\s*:/.test(source),
      `${rel} must not scale the interface (specification §6.2: never scale the whole interface to fit)`,
    );
  }
});

test("no dedicated tablet or landscape layout is introduced", async () => {
  const h = await loadHarness();
  // The app is configured portrait-only.
  const appConfig = readFileSync(join(repoRoot, "apps", "mobile", "app.config.ts"), "utf8");
  assert.match(appConfig, /orientation:\s*["']portrait["']/, "the app must stay portrait-only");
  // No tablet/landscape identifiers in app or shared source.
  for (const dir of ["apps/mobile/app", "apps/mobile/src"]) {
    const sources = walkFiles(join(repoRoot, dir), (name) => /\.tsx?$/.test(name));
    for (const rel of sources) {
      const source = readFileSync(join(repoRoot, rel), "utf8");
      assert.ok(
        !/\btablet\b|\blandscape\b/i.test(source),
        `${rel} must not introduce a tablet or landscape layout`,
      );
    }
  }
  // The manifest itself only ever produces portrait phone frames.
  for (const combo of allCombos()) {
    for (const surface of ["shell", "primitives"]) {
      const m = h.buildManifest(surface, combo);
      assert.ok(
        m.device.width < m.device.height && m.device.width <= 412,
        `${surface} manifest must stay on approved portrait phone frames`,
      );
    }
  }
});

test("selected and unselected tab states are represented distinctly", async () => {
  const h = await loadHarness();
  for (const combo of allCombos()) {
    const m = h.buildManifest("shell", combo);
    const selected = m.layout.tabs.filter((tab) => tab.selected);
    assert.equal(
      selected.length,
      1,
      `exactly one tab must be selected at ${combo.platform}|${combo.device.id}`,
    );
    assert.equal(
      selected[0].route,
      "index",
      "Calendar must be the default selected root (§8)",
    );
    for (const tab of m.layout.tabs) {
      assert.equal(
        tab.accessibilityState.selected,
        tab.selected,
        `tab ${tab.route} accessibilityState.selected must match its selection`,
      );
      assert.ok(
        tab.colors.selected !== tab.colors.unselected,
        `tab ${tab.route} must render selected and unselected states with distinct colors`,
      );
    }
  }
});

test("MTS-013+ feature behavior stays out of the harness fixtures", async () => {
  // The harness, its fixtures, and its baselines must not smuggle in later
  // feature behavior (E02 domain: missions/series/recurrence/streaks/...).
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
  // Scan the harness, its fixtures, and its baselines only — the contract
  // suite itself legitimately names the forbidden vocabulary.
  const files = [];
  for (const dir of ["harness", "fixtures", "baselines"]) {
    files.push(
      ...walkFiles(join(repoRoot, "tests", "mts-012", dir), (name) => /\.(mjs|json)$/.test(name)),
    );
  }
  for (const rel of files) {
    const text = readFileSync(join(repoRoot, rel), "utf8");
    for (const term of forbidden) {
      assert.ok(
        !text.toLowerCase().includes(term),
        `${rel} must not contain MTS-013+ feature vocabulary ("${term}")`,
      );
    }
  }
});
