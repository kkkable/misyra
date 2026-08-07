/**
 * MTS-003 contract: mobile root tab inventory.
 *
 * Technical specification section 8 fixes the permanent bottom navigation to
 * exactly Calendar, AI Planner, Progress, and Settings, with Calendar as the
 * default root. This contract inspects the real Expo Router route tree and
 * cross-checks it against the built localization catalogs, so it cannot pass
 * from a duplicated constant alone.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { repoRoot } from "../toolchain/helpers.mjs";

const TABS_DIR = join(repoRoot, "apps", "mobile", "app", "(tabs)");
const FIXTURE_ROUTE_GROUPS = join(repoRoot, "tests", "fixtures", "mts-003", "route-groups");

/** Approved inventory from technical specification section 8. */
const APPROVED_TABS = [
  { route: "index", key: "tabs.calendar", label: "Calendar" },
  { route: "ai-planner", key: "tabs.aiPlanner", label: "AI Planner" },
  { route: "progress", key: "tabs.progress", label: "Progress" },
  { route: "settings", key: "tabs.settings", label: "Settings" },
];

/**
 * Import the built @misyra/localization public entry, building the workspace
 * first when the dist output is not present yet.
 *
 * @returns {Promise<any>} the localization public entry module
 */
async function loadLocalization() {
  const distEntry = join(repoRoot, "packages", "localization", "dist", "index.js");
  if (!existsSync(distEntry)) {
    execFileSync("pnpm", ["--filter", "@misyra/localization", "run", "build"], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: "pipe",
    });
  }
  return import(pathToFileURL(distEntry).href);
}

test("the mobile app exposes the (tabs) route group", () => {
  assert.ok(existsSync(TABS_DIR), "apps/mobile/app/(tabs) is missing");
});

test("the tab route inventory is exactly the four approved routes", () => {
  const files = readdirSync(TABS_DIR)
    .filter((name) => name.endsWith(".tsx"))
    .sort();
  const expected = ["_layout.tsx", ...APPROVED_TABS.map((tab) => `${tab.route}.tsx`)].sort();
  assert.deepEqual(
    files,
    expected,
    `root tab routes must be exactly the approved four (plus the layout), got: ${files.join(", ")}`,
  );
});

test("the tab layout registers exactly the approved route names", () => {
  const layout = readFileSync(join(TABS_DIR, "_layout.tsx"), "utf8");
  const names = [...layout.matchAll(/<Tabs\.Screen[^>]*\bname="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    [...names].sort(),
    APPROVED_TABS.map((tab) => tab.route).sort(),
    `Tabs layout must register exactly the approved routes, got: ${names.join(", ")}`,
  );
});

test("the tab layout sources its labels from the localization boundary", () => {
  const layout = readFileSync(join(TABS_DIR, "_layout.tsx"), "utf8");
  assert.match(
    layout,
    /from\s+["']@misyra\/localization["']/,
    "tab labels must come from @misyra/localization, not hard-coded strings",
  );
});

test("each tab route carries its approved localization key", () => {
  for (const tab of APPROVED_TABS) {
    const source = readFileSync(join(TABS_DIR, `${tab.route}.tsx`), "utf8");
    assert.ok(
      source.includes(tab.key),
      `${tab.route}.tsx must use localization key ${tab.key} (${tab.label})`,
    );
  }
});

test("the permanent tab contract accepts non-tab root route groups", () => {
  const fixtureTabsDir = join(FIXTURE_ROUTE_GROUPS, "(tabs)");

  // The representative keeps the permanent tab inventory exactly...
  const fixtureTabFiles = readdirSync(fixtureTabsDir)
    .filter((name) => name.endsWith(".tsx"))
    .sort();
  assert.deepEqual(
    fixtureTabFiles,
    ["_layout.tsx", ...APPROVED_TABS.map((tab) => `${tab.route}.tsx`)].sort(),
    "the fixture (tabs) group must keep exactly the approved four routes",
  );

  // ...while a non-tab root route group exists next to it.
  const fixtureRootGroups = readdirSync(FIXTURE_ROUTE_GROUPS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.ok(fixtureRootGroups.includes("(tabs)"), "the fixture keeps the (tabs) group");
  assert.ok(
    fixtureRootGroups.some((name) => name !== "(tabs)"),
    "the fixture adds a representative non-tab route group",
  );

  // A root-directory exclusivity rule rejects this approved-shape tree even
  // though the permanent tab inventory is untouched.
  const exclusivityRuleAccepts =
    fixtureRootGroups.length === 1 && fixtureRootGroups[0] === "(tabs)";
  assert.equal(
    exclusivityRuleAccepts,
    false,
    "sanity: the representative must trip any root-directory exclusivity rule",
  );

  // The MTS-003 contract protects only the permanent tab inventory, so it
  // must not enforce such an exclusivity rule anywhere.
  const contractSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const enforcesExclusivity = /deepEqual\([\s\S]{0,160}?\["\(tabs\)"\]/.test(contractSource);
  assert.equal(
    enforcesExclusivity,
    false,
    "the permanent tab contract must not require apps/mobile/app to hold only the (tabs) group; approved later modal routes keep the same four permanent tabs",
  );
});

test("both localization catalogs define exactly the approved tab labels", async () => {
  const { catalogs, supportedLocales } = await loadLocalization();
  assert.deepEqual(
    [...supportedLocales].sort(),
    ["en", "zh-HK"],
    "supported locales must be exactly en and zh-HK",
  );
  for (const locale of supportedLocales) {
    const catalog = catalogs[locale];
    assert.ok(catalog, `missing catalog for ${locale}`);
    for (const tab of APPROVED_TABS) {
      const value = catalog[tab.key];
      assert.ok(
        typeof value === "string" && value.length > 0,
        `${locale} catalog must define ${tab.key}`,
      );
    }
  }
  assert.equal(catalogs.en["tabs.calendar"], "Calendar", "English Calendar label is canonical");
  assert.equal(
    catalogs.en["tabs.aiPlanner"],
    "AI Planner",
    "English AI Planner label is canonical",
  );
  assert.equal(catalogs.en["tabs.progress"], "Progress", "English Progress label is canonical");
  assert.equal(catalogs.en["tabs.settings"], "Settings", "English Settings label is canonical");
});
