/**
 * MTS-012 harness manifest — deterministic layout manifests for the
 * approved device matrix (technical specification §6.2).
 *
 * Every numeric value in a manifest is derived from REAL application code
 * (compiled primitives core, design tokens, localization catalogs, app
 * sources) through the deterministic text model in ./text.mjs. Nothing here
 * is pixel-captured: a manifest is a declarative, reviewable contract.
 *
 * Surface "shell" models the MTS-010 bottom-tab shell (safe areas, gesture
 * area, tab bar, current tab screen, full-screen modals). Surface
 * "primitives" models the MTS-009 primitive inventory and its touch-target /
 * typography contract at the same device matrix.
 */
import { core, localization, tokens } from "./runtime.mjs";
import {
  appConfigOrientation,
  modalRoutes,
  modalScreenKeys,
  placeholderConstants,
  primitiveStructure,
  tabScreenKeys,
  tabStructure,
} from "./sources.mjs";
import { lineHeight, wrapText } from "./text.mjs";
import { TAB_BAR } from "../fixtures/device-frames.mjs";

export const HARNESS_SCHEMA = 1;

/**
 * @typedef {Object} HarnessCombo
 * @property {"ios" | "android"} platform target platform.
 * @property {Object} device device frame.
 * @property {string} device.id canonical frame id, e.g. "360x800".
 * @property {number} device.width logical width in points.
 * @property {number} device.height logical height in points.
 * @property {Record<"ios" | "android", {top: number, bottom: number, left: number, right: number}>} device.insets canonical safe-area insets.
 * @property {"light" | "dark"} appearance color scheme.
 * @property {string} locale catalog locale ("en" | "zh-HK").
 * @property {number} textScale text-scale multiplier.
 */

/**
 * Canonical, deterministic key for one matrix combination.
 *
 * @param {HarnessCombo} combo matrix combination.
 * @returns {string} `${platform}|${device.id}|${appearance}|${locale}|${textScale}`
 */
export function comboKey({ platform, device, appearance, locale, textScale }) {
  return `${platform}|${device.id}|${appearance}|${locale}|${textScale}`;
}

/** The real, approved app orientation (spec §6.2 — portrait only). */
export const appOrientation = appConfigOrientation();

/**
 * Build the deterministic manifest for one surface at one matrix combo.
 *
 * @param {"shell" | "primitives"} surface surface to model.
 * @param {HarnessCombo} combo matrix combination (platform, device, appearance, locale, textScale).
 * @returns {any} manifest — schema, identity, device, and layout (dynamic model).
 */
export function buildManifest(surface, { platform, device, appearance, locale, textScale }) {
  if (surface === "shell") {
    return buildShellManifest({ platform, device, appearance, locale, textScale });
  }
  if (surface === "primitives") {
    return buildPrimitivesManifest({ platform, device, appearance, locale, textScale });
  }
  throw new Error(`MTS-012 harness: unknown surface "${surface}"`);
}

/**
 * @param {"shell" | "primitives"} surface surface to model.
 * @param {HarnessCombo} combo matrix combination.
 * @returns {object} common manifest identity fields.
 */
function baseManifest(surface, { platform, device, appearance, locale, textScale }) {
  return {
    schema: HARNESS_SCHEMA,
    surface,
    platform,
    device: { id: device.id, width: device.width, height: device.height },
    appearance,
    locale,
    textScale,
  };
}

/**
 * @param {HarnessCombo} combo matrix combination.
 * @returns {any} shell layout manifest.
 */
function buildShellManifest(combo) {
  const { platform, device, appearance, locale, textScale } = combo;
  const catalog = localization.catalogs[locale];
  const insets = device.insets[platform];
  const screenPadding = core.SCREEN_HORIZONTAL_PADDING;
  const contentWidth = device.width - 2 * screenPadding;
  const tabBarHeight = TAB_BAR.baseHeight;
  const tabBarY = device.height - insets.bottom - tabBarHeight;
  const tabs = tabStructure();
  const tabWidth = device.width / tabs.length;
  const labelFontSize = TAB_BAR.labelFontSize * textScale;
  const theme = tokens.themes[appearance];

  const tabModels = tabs.map((tab, index) => {
    const label = catalog[tab.titleKey];
    const wrapped = wrapText(label, labelFontSize, tabWidth);
    const selected = index === 0;
    return {
      route: tab.route,
      label,
      x: index * tabWidth,
      y: tabBarY,
      width: tabWidth,
      height: tabBarHeight,
      selected,
      accessibilityState: { selected },
      colors: {
        selected: theme.primary,
        unselected: theme.textSecondary,
      },
      labelLines: wrapped.lines.length,
      labelLineWidths: wrapped.lineWidths,
      labelFits: wrapped.lineWidths.every((width) => width <= tabWidth),
    };
  });

  const screenKeys = tabScreenKeys("index");
  const placeholder = placeholderConstants();
  const title = catalog[screenKeys.titleKey];
  const body = catalog[screenKeys.bodyKey];
  const titleFontSize = placeholder.titleFontSize * textScale;
  const bodyFontSize = placeholder.bodyFontSize * textScale;
  const titleWrap = wrapText(title, titleFontSize, contentWidth);
  const bodyWrap = wrapText(body, bodyFontSize, contentWidth);
  const availableHeight = device.height - insets.top - insets.bottom - tabBarHeight;

  const modals = modalRoutes().map((route) => {
    const keys = modalScreenKeys(route);
    const modalTitle = catalog[keys.titleKey];
    const modalBody = catalog[keys.bodyKey];
    const modalTitleWrap = wrapText(modalTitle, titleFontSize, contentWidth);
    const modalBodyWrap = wrapText(modalBody, bodyFontSize, contentWidth);
    return {
      route,
      title: modalTitle,
      body: modalBody,
      titleLines: modalTitleWrap.lines.length,
      titleLineWidths: modalTitleWrap.lineWidths,
      titleFits: modalTitleWrap.lineWidths.every((width) => width <= contentWidth),
      bodyLines: modalBodyWrap.lines.length,
      bodyLineWidths: modalBodyWrap.lineWidths,
      bodyFits: modalBodyWrap.lines.length * lineHeight(bodyFontSize) <= availableHeight,
    };
  });

  return {
    ...baseManifest("shell", combo),
    layout: {
      safeArea: insets,
      screenPadding,
      contentWidth,
      screen: {
        title,
        titleLines: titleWrap.lines.length,
        titleLineWidths: titleWrap.lineWidths,
        titleFits: titleWrap.lineWidths.every((width) => width <= contentWidth),
        titleRequiredHeight: titleWrap.lines.length * lineHeight(titleFontSize),
        body,
        bodyLines: bodyWrap.lines.length,
        bodyLineWidths: bodyWrap.lineWidths,
        bodyRequiredHeight: bodyWrap.lines.length * lineHeight(bodyFontSize),
        availableHeight,
        bodyFits: bodyWrap.lines.length * lineHeight(bodyFontSize) <= availableHeight,
      },
      tabBar: {
        x: 0,
        y: tabBarY,
        width: device.width,
        height: tabBarHeight,
        bottomInset: insets.bottom,
        aboveGestureArea: true,
        tabTouch: { width: tabWidth, height: tabBarHeight },
        labelFontSize,
      },
      tabs: tabModels,
      modals,
    },
  };
}

/**
 * @param {HarnessCombo} combo matrix combination.
 * @returns {any} primitives layout manifest.
 */
function buildPrimitivesManifest(combo) {
  const { device, appearance, locale, textScale } = combo;
  primitiveStructure();
  const catalog = localization.catalogs[locale];
  const theme = tokens.themes[appearance];
  const screenPadding = core.SCREEN_HORIZONTAL_PADDING;
  const contentWidth = device.width - 2 * screenPadding;
  const body = (/** @type {number} */ weight) => core.semanticTypographyStyle("body", weight);
  const characteristic = (/** @type {string} */ token) => core.semanticTypographyStyle(token);

  const buttonLabel = catalog["placeholders.calendar"];
  const buttonFontSize = body(500).fontSize * textScale;
  const buttonWrap = wrapText(buttonLabel, buttonFontSize, contentWidth);
  const buttonRequiredHeight = buttonWrap.lines.length * lineHeight(buttonFontSize);
  const buttonHeight = Math.max(core.MIN_TOUCH_TARGET, buttonRequiredHeight);

  return {
    ...baseManifest("primitives", combo),
    layout: {
      safeArea: device.insets[combo.platform],
      screenPadding,
      contentWidth,
      tokens: {
        minTouchTarget: core.MIN_TOUCH_TARGET,
        screenPadding: core.SCREEN_HORIZONTAL_PADDING,
        largeSectionSpacing: core.LARGE_SECTION_SPACING,
        colors: {
          surface: core.surfaceToken(appearance, "surface"),
          primary: theme.primary,
          textPrimary: theme.textPrimary,
          textSecondary: theme.textSecondary,
        },
      },
      typography: {
        body: characteristic("body"),
        bodySmall: characteristic("bodySmall"),
        headline: characteristic("headline"),
        title3: characteristic("title3"),
      },
      primitives: {
        button: {
          minWidth: core.MIN_TOUCH_TARGET,
          minHeight: core.MIN_TOUCH_TARGET,
          typography: body(500),
          wrapped: true,
          labelCase: {
            text: buttonLabel,
            lines: buttonWrap.lines.length,
            lineWidths: buttonWrap.lineWidths,
            requiredHeight: buttonRequiredHeight,
            height: buttonHeight,
            fits: buttonWrap.lineWidths.every((width) => width <= contentWidth),
          },
        },
        iconButton: {
          minWidth: core.MIN_TOUCH_TARGET,
          minHeight: core.MIN_TOUCH_TARGET,
        },
        textField: {
          minWidth: core.MIN_TOUCH_TARGET,
          minHeight: core.MIN_TOUCH_TARGET,
          typography: body(400),
          paddingHorizontal: tokens.space[3],
          paddingVertical: tokens.space[3],
        },
        textArea: {
          minWidth: core.MIN_TOUCH_TARGET,
          minHeight: 120,
          typography: body(400),
        },
        row: {
          minWidth: core.MIN_TOUCH_TARGET,
          minHeight: core.MIN_TOUCH_TARGET,
          titleTypography: body(500),
          detailTypography: core.semanticTypographyStyle("bodySmall", 400),
        },
        card: {
          padding: tokens.space[4],
          radius: tokens.radius.lg,
        },
        topBar: {
          minWidth: core.MIN_TOUCH_TARGET,
          minHeight: core.MIN_TOUCH_TARGET + tokens.space[2],
          titleTypography: characteristic("title3"),
          detailTypography: characteristic("headline"),
        },
        sectionHeading: {
          typography: characteristic("title3"),
        },
        screen: {
          paddingHorizontal: core.SCREEN_HORIZONTAL_PADDING,
          edges: ["top", "left", "right", "bottom"],
        },
      },
    },
  };
}

/**
 * Compare two manifest (sub)values and list every difference with its exact
 * path — deterministic ordering, no exceptions for mismatches.
 *
 * @param {any} actual value under test.
 * @param {any} expected accepted value.
 * @param {string} path current path (internal recursion).
 * @returns {Array<{path: string, expected: any, actual: any}>} path-level diffs.
 */
export function compareManifest(actual, expected, path = "") {
  if (Object.is(actual, expected)) {
    return [];
  }
  if (
    actual === null ||
    expected === null ||
    typeof actual !== "object" ||
    typeof expected !== "object"
  ) {
    return [{ path, expected, actual }];
  }
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort();
  const diffs = [];
  for (const key of keys) {
    const childPath = path === "" ? key : `${path}.${key}`;
    if (!(key in actual) || !(key in expected)) {
      diffs.push({ path: childPath, expected: expected[key], actual: actual[key] });
      continue;
    }
    diffs.push(...compareManifest(actual[key], expected[key], childPath));
  }
  return diffs;
}

/**
 * Assert two manifest values are equal, throwing a path-level diff report.
 * This is the visual-regression gate: it never silently accepts a drift.
 *
 * @param {unknown} actual value under test.
 * @param {unknown} expected accepted value.
 * @param {string} label human-readable label for the report.
 */
export function assertManifestsEqual(actual, expected, label) {
  const diffs = compareManifest(actual, expected);
  if (diffs.length === 0) {
    return;
  }
  const shown = diffs.slice(0, 20);
  const summary =
    shown
      .map(
        (diff) =>
          `  ${diff.path}: expected ${JSON.stringify(diff.expected)} got ${JSON.stringify(diff.actual)}`,
      )
      .join("\n") +
    (diffs.length > shown.length ? `\n  … and ${diffs.length - shown.length} more` : "");
  throw new Error(
    `${label}: visual/layout mismatch (${diffs.length} diff(s)):\n${summary}\n` +
      `Baselines update ONLY via the explicit reviewed workflow: pnpm visual:update-baselines`,
  );
}
