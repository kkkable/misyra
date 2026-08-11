/**
 * MTS-012 image harness — deterministic screenshot capture and comparison.
 *
 * Bundles the REAL MTS-009 primitives and the REAL MTS-010 shell-screen
 * surface with esbuild (react-native resolved to react-native-web through
 * the harness shims), renders them in headless Chromium via Playwright,
 * and returns byte-deterministic PNG buffers. Baselines are NEVER written
 * here — the only writer is the explicit `visual:update-image-baselines`
 * script (tests/mts-012/update-image-baselines.mjs).
 *
 * Determinism: the bundle is built once per process, pages are rendered
 * with a pinned viewport/deviceScaleFactor/locale/color-scheme, the bundled
 * subset font covers every character the fixtures can render, and captures
 * wait for the first painted frames plus document.fonts.ready.
 */
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";
// pixelmatch is CJS; Node ESM interop exposes the function as the default.
import pixelmatch from "pixelmatch";
import * as esbuild from "esbuild";
import { chromium } from "playwright";

import { repoRoot } from "../../toolchain/helpers.mjs";
import {
  IMAGE_BASELINE_PLATFORMS,
  IMAGE_BASELINES_DIR,
  imageBaselineName,
} from "../fixtures/image-frames.mjs";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const BUNDLE_ENTRY = join(HARNESS_DIR, "bundle-entry.tsx");
const FONT_PATH = join(HARNESS_DIR, "fonts", "MisyraTest-Regular.woff2");

/** Surfaces the image harness may capture — exactly the approved MTS-012 set. */
export const capturableSurfaces = Object.freeze(["primitives", "shell-screen"]);

/** @typedef {import("../fixtures/image-frames.mjs").ImageCombo} ImageCombo */

/**
 * Build a workspace package's dist on demand with the same script CI uses.
 * @param {string} entry dist entry file to check.
 * @param {string} packageRoot package directory containing scripts/build.mjs.
 */
function ensureBuilt(entry, packageRoot) {
  if (existsSync(entry)) {
    return;
  }
  execFileSync(process.execPath, [join(packageRoot, "scripts", "build.mjs")], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (!existsSync(entry)) {
    throw new Error(`MTS-012 image harness: build did not produce ${entry}`);
  }
}

/**
 * Windows-safe absolute path for esbuild alias values.
 * @param {string} filePath
 */
function esbuildPath(filePath) {
  return resolve(filePath).replace(/\\/g, "/");
}

const DESIGN_TOKENS_PKG = join(repoRoot, "packages", "design-tokens");
const LOCALIZATION_PKG = join(repoRoot, "packages", "localization");
const MOBILE_NODE_MODULES = join(repoRoot, "apps", "mobile", "node_modules");

/** @type {Promise<string> | undefined} */
let bundlePagePromise;

/**
 * Build the capture bundle + serve the capture page exactly once per
 * process. Chromium blocks module scripts over file://, so a loopback-only
 * static server (random port, offline) serves the page, the bundle, and
 * the subset font; the harness never touches the network.
 */
function buildBundlePage() {
  bundlePagePromise ??= (async () => {
    ensureBuilt(join(DESIGN_TOKENS_PKG, "dist", "index.js"), DESIGN_TOKENS_PKG);
    ensureBuilt(join(LOCALIZATION_PKG, "dist", "index.js"), LOCALIZATION_PKG);
    const bundlePath = join(tmpdir(), `misyra-image-capture-${process.pid}.mjs`);
    await esbuild.build({
      entryPoints: [BUNDLE_ENTRY],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "chrome120",
      jsx: "automatic",
      outfile: bundlePath,
      logLevel: "warning",
      define: {
        "process.env.NODE_ENV": '"production"',
        global: "globalThis",
      },
      // Metro-web-style resolution order: platform variants win.
      resolveExtensions: [
        ".web.tsx",
        ".web.ts",
        ".web.jsx",
        ".web.js",
        ".tsx",
        ".ts",
        ".jsx",
        ".js",
        ".json",
      ],
      alias: {
        "react-native": esbuildPath(join(HARNESS_DIR, "rn-web.mjs")),
        "expo-modules-core": esbuildPath(join(HARNESS_DIR, "shim-expo-modules-core.mjs")),
        "react-native-safe-area-context": esbuildPath(
          join(
            MOBILE_NODE_MODULES,
            "react-native-safe-area-context",
            "lib",
            "commonjs",
            "index.js",
          ),
        ),
        "expo-localization": esbuildPath(
          join(MOBILE_NODE_MODULES, "expo-localization", "build", "Localization.js"),
        ),
        "@misyra/design-tokens": esbuildPath(join(DESIGN_TOKENS_PKG, "dist", "index.js")),
        "@misyra/localization": esbuildPath(join(LOCALIZATION_PKG, "dist", "index.js")),
      },
    });
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  html, body, #root { margin: 0; padding: 0; width: 100%; height: 100%; }
  body { background: #ffffff; }
  * { box-sizing: border-box; }
  @font-face {
    font-family: "MisyraTest";
    src: url("/font.woff2") format("woff2");
    font-weight: 400;
    font-style: normal;
    font-display: block;
  }
  html { font-family: "MisyraTest", sans-serif; }
</style>
</head>
<body>
<div id="root"></div>
<script type="module" src="/bundle.mjs"></script>
</body>
</html>
`;
    const bundleSource = await readFile(bundlePath);
    const fontSource = await readFile(FONT_PATH);
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/page.html") {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(html);
      } else if (url.pathname === "/bundle.mjs") {
        res.setHeader("content-type", "text/javascript");
        res.end(bundleSource);
      } else if (url.pathname === "/font.woff2") {
        res.setHeader("content-type", "font/woff2");
        res.end(fontSource);
      } else {
        res.statusCode = 404;
        res.end("not found");
      }
    });
    await new Promise((resolveListen) => {
      server.listen(0, "127.0.0.1", () => resolveListen(undefined));
    });
    captureServer = server;
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("MTS-012 image harness: server did not bind a port");
    }
    return `http://127.0.0.1:${address.port}/page.html`;
  })();
  return bundlePagePromise;
}

/** @type {import("node:http").Server | undefined} */
let captureServer;

/**
 * @type {Promise<import("playwright").Browser> | undefined}
 */
let browserPromise;

/** Launch the shared headless Chromium exactly once per process. */
export function captureBrowser() {
  browserPromise ??= chromium.launch();
  return browserPromise;
}

/**
 * Release the harness environment (browser + loopback server) so test
 * processes can exit. Idempotent; safe to call at any time.
 */
export async function closeCaptureEnvironment() {
  if (browserPromise !== undefined) {
    const browser = await browserPromise;
    browserPromise = undefined;
    await browser.close();
  }
  const server = captureServer;
  if (server !== undefined) {
    await new Promise((resolveClose) => server.close(resolveClose));
    captureServer = undefined;
  }
}

/**
 * Validate a capture combo against the approved surface/platform sets.
 * @param {ImageCombo & { platform: string }} combo
 */
function validateCombo(combo) {
  if (!capturableSurfaces.includes(combo.surface)) {
    throw new Error(
      `MTS-012 image harness: unknown surface "${combo.surface}"; capturable surfaces: ${capturableSurfaces.join(", ")}`,
    );
  }
  if (!IMAGE_BASELINE_PLATFORMS.includes(combo.platform)) {
    throw new Error(
      `MTS-012 image harness: platform "${combo.platform}" cannot be captured; capturable platforms: ${IMAGE_BASELINE_PLATFORMS.join(", ")}`,
    );
  }
}

/**
 * Capture one deterministic PNG screenshot of a REAL Misyra surface.
 * @param {ImageCombo & { platform: string }} combo
 * @returns {Promise<Buffer>}
 */
export async function captureScreenshot(combo) {
  validateCombo(combo);
  const pageUrl = await buildBundlePage();
  const browser = await captureBrowser();
  const context = await browser.newContext({
    viewport: { width: combo.width, height: combo.height },
    deviceScaleFactor: 1,
    locale: combo.locale,
    colorScheme: combo.appearance,
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(
      (config) => {
        const pageWin = /** @type {Record<string, any>} */ (globalThis);
        pageWin.__MISYRA_CAPTURE_CONFIG__ = config;
        pageWin.__MISYRA_TEXT_SCALE__ = config.textScale;
      },
      {
        surface: combo.surface,
        appearance: combo.appearance,
        locale: combo.locale,
        textScale: combo.textScale,
      },
    );
    await page.goto(pageUrl, { waitUntil: "load" });
    await page.waitForFunction(
      () => /** @type {Record<string, any>} */ (globalThis).__MISYRA_RENDERED__ === true,
      undefined,
      { timeout: 30_000 },
    );
    await page.evaluate(() => {
      const pageWin = /** @type {Record<string, any>} */ (globalThis);
      return pageWin.document.fonts.ready;
    });
    return await page.locator("#root").screenshot();
  } finally {
    await context.close();
  }
}

/**
 * Compare two decoded PNG buffers and return the differing-pixel ratio.
 * @param {Buffer} actual
 * @param {Buffer} expected
 * @returns {number} ratio in [0, 1]
 */
export function compareShots(actual, expected) {
  const a = PNG.sync.read(actual);
  const b = PNG.sync.read(expected);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `MTS-012 image harness: cannot compare ${a.width}x${a.height} with ${b.width}x${b.height}`,
    );
  }
  const diffOutput = Buffer.alloc(a.width * a.height * 4);
  const diff = pixelmatch(a.data, b.data, diffOutput, a.width, a.height, {
    threshold: 0.1,
  });
  return diff / (a.width * a.height);
}

/**
 * Absolute path of the committed baseline for a combo (read-only usage).
 * @param {ImageCombo & { platform: string }} combo
 */
export function imageBaselinePath(combo) {
  validateCombo(combo);
  return join(IMAGE_BASELINES_DIR, combo.platform, imageBaselineName(combo));
}
