/**
 * MTS-012 harness sources — reads the REAL application sources so the
 * manifest model can never drift silently from the structure it models.
 *
 * Every accessor both extracts a value and asserts the source still wires
 * the mechanism the model relies on; a future refactor that changes the
 * mechanism fails the harness loudly instead of producing a stale baseline.
 */
import { readText } from "../../toolchain/helpers.mjs";

/**
 * Read a repo source and assert it still wires every modeled mechanism.
 *
 * @param {string} relativePath repo-relative source path.
 * @param {string[]} needles substrings the source must still contain.
 * @returns {string} the source text.
 */
function assertContains(relativePath, needles) {
  const source = readText(relativePath);
  const missing = needles.filter((needle) => !source.includes(needle));
  if (missing.length > 0) {
    throw new Error(
      `MTS-012 harness: ${relativePath} no longer contains ${missing
        .map((n) => JSON.stringify(n))
        .join(", ")} — the modeled mechanism changed; review and re-baseline deliberately`,
    );
  }
  return source;
}

/** The four approved bottom tabs, in real file order (MTS-010 shell). */
export function tabStructure() {
  const layout = readText("apps/mobile/app/(tabs)/_layout.tsx");
  const tabs = [];
  const screenPattern = /<Tabs\.Screen\b([^>]*)>/g;
  let match;
  while ((match = screenPattern.exec(layout)) !== null) {
    const tag = match[1];
    if (tag === undefined) {
      throw new Error("MTS-012 harness: cannot parse <Tabs.Screen> tag in (tabs)/_layout.tsx");
    }
    const name = tag.match(/\bname="([^"]+)"/)?.[1];
    const titleKey = tag.match(/\btranslate\(catalog,\s*"([^"]+)"\)/)?.[1];
    if (name === undefined || titleKey === undefined) {
      throw new Error(
        "MTS-012 harness: cannot parse <Tabs.Screen> in apps/mobile/app/(tabs)/_layout.tsx",
      );
    }
    tabs.push({ route: name, titleKey });
  }
  if (tabs.length !== 4) {
    throw new Error(
      `MTS-012 harness: expected exactly 4 bottom tabs, found ${tabs.length} in (tabs)/_layout.tsx`,
    );
  }
  return tabs;
}

/** Placeholder title/body keys of the current tab screen (e.g. index.tsx). */
/** @param {string} route tab route file name without extension. */
export function tabScreenKeys(route) {
  const source = readText(`apps/mobile/app/(tabs)/${route}.tsx`);
  const titleKey = source.match(/\btitleKey="([^"]+)"/)?.[1];
  const bodyKey = source.match(/\bbodyKey="([^"]+)"/)?.[1];
  if (titleKey === undefined || bodyKey === undefined) {
    throw new Error(`MTS-012 harness: cannot parse titleKey/bodyKey in (tabs)/${route}.tsx`);
  }
  return { titleKey, bodyKey };
}

/** Modal routes registered on the root stack with fullScreenModal (MTS-010). */
export function modalRoutes() {
  const layout = readText("apps/mobile/app/_layout.tsx");
  const routes = [];
  const screenPattern = /<Stack\.Screen\b([^>]*)>/g;
  let match;
  while ((match = screenPattern.exec(layout)) !== null) {
    const tag = match[1];
    if (tag === undefined) {
      throw new Error("MTS-012 harness: cannot parse <Stack.Screen> tag in app/_layout.tsx");
    }
    if (
      /presentation:\s*"fullScreenModal"/.test(tag) ||
      /presentation="fullScreenModal"/.test(tag)
    ) {
      const name = tag.match(/\bname="([^"]+)"/)?.[1];
      if (name === undefined) {
        throw new Error("MTS-012 harness: cannot parse fullScreenModal Stack.Screen name");
      }
      routes.push(name);
    }
  }
  return routes;
}

/** Placeholder title/body keys of a modal screen (evidence.tsx, story.tsx). */
/** @param {string} route modal route file name without extension. */
export function modalScreenKeys(route) {
  const source = readText(`apps/mobile/app/${route}.tsx`);
  const titleKey = source.match(/\btitleKey="([^"]+)"/)?.[1];
  const bodyKey = source.match(/\bbodyKey="([^"]+)"/)?.[1];
  if (titleKey === undefined || bodyKey === undefined) {
    throw new Error(`MTS-012 harness: cannot parse titleKey/bodyKey in ${route}.tsx`);
  }
  return { titleKey, bodyKey };
}

/** Hard-coded PlaceholderScreen metrics (pre-token scaffold, real source). */
export function placeholderConstants() {
  const source = readText("apps/mobile/src/components/PlaceholderScreen.tsx");
  const padding = source.match(/\bpadding:\s*(\d+)/)?.[1];
  const titleFontSize = source.match(/title:\s*\{\s*fontSize:\s*(\d+)/)?.[1];
  const bodyFontSize = source.match(/body:\s*\{\s*fontSize:\s*(\d+)/)?.[1];
  if (padding === undefined || titleFontSize === undefined || bodyFontSize === undefined) {
    throw new Error("MTS-012 harness: cannot parse PlaceholderScreen metrics");
  }
  return {
    padding: Number(padding),
    titleFontSize: Number(titleFontSize),
    bodyFontSize: Number(bodyFontSize),
  };
}

/** Provenance assertions for every modeled primitive mechanism (MTS-009). */
export function primitiveStructure() {
  assertContains("apps/mobile/src/primitives/Button.tsx", [
    "minTouchTargetStyle()",
    'semanticTypographyStyle("body", 500)',
    "wrappableTextStyle()",
  ]);
  assertContains("apps/mobile/src/primitives/IconButton.tsx", ["minTouchTargetStyle()"]);
  assertContains("apps/mobile/src/primitives/TextField.tsx", [
    "minHeight: MIN_TOUCH_TARGET",
    'semanticTypographyStyle("body", 400)',
  ]);
  assertContains("apps/mobile/src/primitives/TextArea.tsx", [
    "minHeight: 120",
    'semanticTypographyStyle("body", 400)',
  ]);
  assertContains("apps/mobile/src/primitives/Row.tsx", [
    "minHeight: MIN_TOUCH_TARGET",
    'semanticTypographyStyle("body", 500)',
    'semanticTypographyStyle("bodySmall", 400)',
  ]);
  assertContains("apps/mobile/src/primitives/Card.tsx", [
    "padding: space[4]",
    "borderRadius: radius.lg",
  ]);
  assertContains("apps/mobile/src/primitives/TopBar.tsx", [
    "minHeight: MIN_TOUCH_TARGET + space[2]",
    'semanticTypographyStyle("title3")',
  ]);
  assertContains("apps/mobile/src/primitives/SectionHeading.tsx", [
    'semanticTypographyStyle("title3")',
  ]);
  assertContains("apps/mobile/src/primitives/Screen.tsx", [
    'edges={["top", "left", "right", "bottom"]}',
    "SCREEN_HORIZONTAL_PADDING",
  ]);
  return true;
}

/** The app config keeps the interface locked to portrait (spec §6.2). */
export function appConfigOrientation() {
  const config = readText("apps/mobile/app.config.ts");
  const orientation = config.match(/\borientation:\s*"([^"]+)"/)?.[1];
  if (orientation === undefined) {
    throw new Error("MTS-012 harness: cannot parse orientation in app.config.ts");
  }
  return orientation;
}
