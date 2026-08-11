/**
 * MTS-010 contract: four-tab navigation shell.
 *
 * Technical specification section 8 and the MTS-010 ticket fix the permanent
 * bottom navigation to exactly Calendar, AI Planner, Progress, and Settings,
 * with Calendar as the default root; Evidence and Story exist only as
 * full-screen modal route boundaries above the tab navigator; safe areas and
 * bottom gesture insets are respected by the shell; invalid or deleted-target
 * deep links fall back deterministically to Calendar.
 *
 * These contracts inspect the real Expo Router route tree and the real
 * localization catalogs so they cannot pass from a duplicated constant alone.
 */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileExists, readText, repoRoot } from "../toolchain/helpers.mjs";

const APP_DIR = join(repoRoot, "apps", "mobile", "app");
const TABS_DIR = join(APP_DIR, "(tabs)");

/** Approved permanent tab inventory from technical specification section 8. */
const APPROVED_TABS = [
  { route: "index", label: "Calendar" },
  { route: "ai-planner", label: "AI Planner" },
  { route: "progress", label: "Progress" },
  { route: "settings", label: "Settings" },
];

/** Full-screen modal route boundaries that must never appear in tab navigation. */
const MODAL_ROUTES = [
  { route: "evidence", titleKey: "placeholders.evidenceTitle", bodyKey: "placeholders.evidence" },
  { route: "story", titleKey: "placeholders.storyTitle", bodyKey: "placeholders.story" },
];

/** Route names that must never exist as permanent tabs (specification §8). */
const FORBIDDEN_TAB_ROUTES = ["missions", "stories", "evidence", "story", "home", "dashboard"];

/** Import specifier extraction: `from "x"` and `import("x")`. */
const IMPORT_SPECIFIER = /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g;

/**
 * Extract the full opening tag of a `<Stack.Screen ... name="..." .../>`.
 *
 * @param {string} source layout source text.
 * @param {string} name route name to find.
 * @returns {string | undefined} the opening tag when registered.
 */
function stackScreenTag(source, name) {
  const pattern = new RegExp(`<Stack\\.Screen\\b[^>]*\\bname="${name}"[^>]*>`);
  const match = source.match(pattern);
  return match === null ? undefined : match[0];
}

/**
 * Assert a single-line JSX tag carries an exact `prop="value"` pair.
 *
 * @param {string} tag the opening tag text.
 * @param {string} prop the prop name.
 * @param {string} value the exact quoted value.
 */
function assertTagProp(tag, prop, value) {
  const pattern = new RegExp(`\\b${prop}="${value}"`);
  assert.match(tag, pattern, `expected ${prop}="${value}" inside <${tag}>`);
}

test("the mobile app keeps exactly the four approved permanent tab routes", () => {
  const files = readdirSync(TABS_DIR)
    .filter((name) => name.endsWith(".tsx"))
    .sort();
  const expected = ["_layout.tsx", ...APPROVED_TABS.map((tab) => `${tab.route}.tsx`)].sort();
  assert.deepEqual(
    files,
    expected,
    `permanent tab routes must be exactly the approved four (plus the layout), got: ${files.join(", ")}`,
  );
});

test("no Missions/Stories/modal route is hidden inside the permanent tab group", () => {
  const files = readdirSync(TABS_DIR)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => name.replace(/\.tsx$/, "").replace(/^_layout$/, ""));
  for (const forbidden of FORBIDDEN_TAB_ROUTES) {
    assert.ok(
      !files.includes(forbidden),
      `forbidden permanent tab route "${forbidden}" must not live inside (tabs)`,
    );
  }
});

test("the tab layout registers exactly the approved tab names", () => {
  const layout = readText("apps/mobile/app/(tabs)/_layout.tsx");
  const names = [...layout.matchAll(/<Tabs\.Screen[^>]*\bname="([^"]+)"/g)].map(
    (match) => String(match[1]),
  );
  assert.deepEqual(
    [...names].sort(),
    APPROVED_TABS.map((tab) => tab.route).sort(),
    `Tabs layout must register exactly the approved routes, got: ${names.join(", ")}`,
  );
});

test("Calendar is the default app root: index inside (tabs), no root index shadow", () => {
  assert.ok(
    fileExists("apps/mobile/app/(tabs)/index.tsx"),
    "Calendar must be the index route of the permanent tab group",
  );
  assert.ok(
    !fileExists("apps/mobile/app/index.tsx"),
    "a root app/index.tsx would shadow the Calendar tab as the default route",
  );
  const layout = readText("apps/mobile/app/(tabs)/_layout.tsx");
  const initial = layout.match(/\binitialRouteName="([^"]+)"/);
  if (initial !== null) {
    assert.equal(
      initial[1],
      "index",
      `the tab group must not point its initial route away from Calendar (index), got: ${initial[1]}`,
    );
  }
});

test("Evidence and Story exist as root modal route boundaries", () => {
  for (const modal of MODAL_ROUTES) {
    assert.ok(
      fileExists(`apps/mobile/app/${modal.route}.tsx`),
      `missing full-screen modal route boundary app/${modal.route}.tsx`,
    );
  }
});

test("the root layout registers Evidence and Story as full-screen modal routes", () => {
  const layout = readText("apps/mobile/app/_layout.tsx");
  for (const modal of MODAL_ROUTES) {
    const tag = stackScreenTag(layout, modal.route);
    assert.ok(
      tag !== undefined,
      `root layout must register <Stack.Screen name="${modal.route}" ...>`,
    );
    if (tag !== undefined) {
      assertTagProp(tag, "presentation", "fullScreenModal");
    }
  }
});

test("the root layout composes navigation inside a safe-area provider", () => {
  const layout = readText("apps/mobile/app/_layout.tsx");
  assert.match(
    layout,
    /from\s+["']react-native-safe-area-context["']/,
    "root layout must consume react-native-safe-area-context for the shell",
  );
  assert.match(layout, /<SafeAreaProvider\b/, "root layout must render <SafeAreaProvider>");
  const provider = layout.indexOf("<SafeAreaProvider");
  const navigator = layout.indexOf("<Stack");
  assert.ok(
    provider !== -1 && navigator !== -1 && provider < navigator,
    "SafeAreaProvider must wrap the Stack navigator so every inset consumer works",
  );
});

test("the tab shell is bottom-gesture-inset aware", () => {
  const layout = readText("apps/mobile/app/(tabs)/_layout.tsx");
  assert.match(
    layout,
    /useSafeAreaInsets\b.*react-native-safe-area-context|react-native-safe-area-context.*useSafeAreaInsets/,
    "tab shell must consume useSafeAreaInsets from react-native-safe-area-context",
  );
  assert.match(layout, /useSafeAreaInsets\(\)/, "tab shell must call useSafeAreaInsets()");
  assert.match(
    layout,
    /tabBarStyle[\s\S]{0,160}?insets\.bottom/,
    "tab bar style must apply the resolved bottom gesture inset",
  );
});

test("unmatched deep-link targets fall back deterministically to Calendar", () => {
  assert.ok(
    fileExists("apps/mobile/app/+not-found.tsx"),
    "app/+not-found.tsx must exist so invalid/deleted-target deep links never leave a blank state",
  );
  const fallback = readText("apps/mobile/app/+not-found.tsx");
  assert.match(
    fallback,
    /from\s+["']expo-router["']/,
    "the fallback route must use the expo-router redirect surface",
  );
  assert.match(fallback, /\bRedirect\b/, "the fallback route must render <Redirect>");
  assert.match(fallback, /href=(["'])\/\1/, "the fallback must target Calendar (/), the product-safe default root");
});

test("the deep-link scheme is configured for the app", () => {
  const config = readText("apps/mobile/app.config.ts");
  assert.match(config, /scheme:\s*["']misyra["']/, "app.config.ts must declare the misyra deep-link scheme");
});

test("modal placeholder screens source their copy from the localization boundary", () => {
  for (const modal of MODAL_ROUTES) {
    const source = readText(`apps/mobile/app/${modal.route}.tsx`);
    assert.ok(
      source.includes(modal.titleKey) && source.includes(modal.bodyKey),
      `${modal.route}.tsx must reference its localization keys (${modal.titleKey}, ${modal.bodyKey})`,
    );
    const hardcoded = source.match(/"([A-Za-z][A-Za-z ]{4,})"/g) ?? [];
    assert.deepEqual(
      hardcoded,
      [],
      `${modal.route}.tsx must not embed user-visible product copy outside the localization boundary: ${hardcoded.join(", ")}`,
    );
  }
});

test("both localization catalogs define the modal placeholder keys in both locales", () => {
  const en = readText("packages/localization/src/catalogs/en.ts");
  const zhHK = readText("packages/localization/src/catalogs/zh-hk.ts");
  const keyPattern = /"([^"]+)":/g;
  /** @type {string[]} */
  const enKeys = [];
  /** @type {string[]} */
  const zhKeys = [];
  for (const match of en.matchAll(keyPattern)) enKeys.push(String(match[1]));
  for (const match of zhHK.matchAll(keyPattern)) zhKeys.push(String(match[1]));
  const valuePattern = /"([^"]+)"\s*:\s*"([^"]*)"/g;
  const enValues = new Map([...en.matchAll(valuePattern)].map((m) => [m[1], m[2]]));
  const zhValues = new Map([...zhHK.matchAll(valuePattern)].map((m) => [m[1], m[2]]));
  for (const modal of MODAL_ROUTES) {
    for (const key of [modal.titleKey, modal.bodyKey]) {
      assert.ok(enKeys.includes(key), `en catalog must define ${key}`);
      assert.ok(zhKeys.includes(key), `zh-HK catalog must define ${key}`);
      const enValue = enValues.get(key);
      const zhValue = zhValues.get(key);
      assert.ok(
        typeof enValue === "string" && enValue.length > 0,
        `en catalog value for ${key} must be non-empty`,
      );
      assert.ok(
        typeof zhValue === "string" && zhValue.length > 0,
        `zh-HK catalog value for ${key} must be non-empty`,
      );
    }
  }
});

test("navigation route files stay within the approved import surface (no later-ticket leakage)", () => {
  const FORBIDDEN_PREFIXES = [
    "@misyra/domain",
    "@misyra/database",
    "@misyra/contracts",
    "expo-haptics",
    "react-native-reanimated",
    "expo-av",
    "expo-audio",
    "expo-image",
    "expo-camera",
    "expo-media-library",
    "@react-native-async-storage/async-storage",
    "expo-sqlite",
    "drizzle-orm",
    "@azure/",
    "openai",
    "@ai-sdk/",
  ];
  const files = readdirSync(APP_DIR, { recursive: true }).filter((name) =>
    name.endsWith(".tsx"),
  );
  assert.ok(files.length > 0, "expected at least one route file under apps/mobile/app");
  for (const file of files) {
    const source = readText(`apps/mobile/app/${file}`);
    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      const specifier = String(match[1]);
      for (const forbidden of FORBIDDEN_PREFIXES) {
        assert.ok(
          !specifier.startsWith(forbidden),
          `${file} imports "${specifier}" which belongs to a later ticket (${forbidden})`,
        );
      }
    }
  }
});
