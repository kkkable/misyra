/**
 * MTS-012 image harness — deterministic screenshot capture and comparison.
 *
 * Two renderer paths:
 *
 * 1. web — the deterministic web/Chromium layer (optional supplemental
 *    coverage): bundles the REAL MTS-009 primitives and the REAL MTS-010
 *    shell-screen surface with esbuild (react-native resolved to
 *    react-native-web through the harness shims), renders them in headless
 *    Chromium via Playwright, and returns byte-deterministic PNG buffers.
 *
 * 2. android — the AUTHORITATIVE mobile renderer path: builds the REAL
 *    surfaces into a harness release APK (see native-entry.tsx) and
 *    screenshots the actual Android framebuffer through adb on an emulator
 *    with a deterministic device/window configuration (logical size pinned
 *    via `wm size`, 1x density via `wm density 160`, immersive system bars,
 *    no animations, system font_scale for text scale, device locale for the
 *    shell-screen catalog).
 *
 * Baselines are NEVER written here — the only writer is the explicit
 * `visual:update-image-baselines` script
 * (tests/mts-012/update-image-baselines.mjs).
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
  const androidServer = androidConfigServer;
  if (androidServer !== undefined) {
    await new Promise((resolveClose) => androidServer.close(resolveClose));
    androidConfigServer = undefined;
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

// ---- Android (actual supported mobile renderer) capture --------------------

/**
 * Fixed loopback port for the android capture configuration server. The
 * device reaches the host through `adb reverse tcp:58321 tcp:58321`, so the
 * port is intentionally fixed, documented in the MTS-012 README, and never
 * ephemeral (the Android app hardcodes it).
 */
export const ANDROID_CAPTURE_PORT = 58321;
/** Android application package produced by the expo prebuild (harness mode). */
const ANDROID_CAPTURE_PACKAGE = "com.anonymous.misyra";

/** @type {string | undefined} */
let androidAdbPath;

function resolveAdb() {
  if (androidAdbPath !== undefined) {
    return androidAdbPath;
  }
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  androidAdbPath =
    sdkRoot !== undefined
      ? join(sdkRoot, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb")
      : "adb";
  return androidAdbPath;
}

/** @param {string[]} args */
function adb(args) {
  return execFileSync(resolveAdb(), args, { encoding: "utf8", stdio: "pipe" });
}

/** @param {string[]} args */
function adbBinary(args) {
  return execFileSync(resolveAdb(), args, { stdio: "pipe", maxBuffer: 32 * 1024 * 1024 });
}

function requireAndroidDevice() {
  const attached = adb(["devices"])
    .split(/\r?\n/)
    .slice(1)
    .some((line) => /^[\w.:-]+\s+device(\s|$)/.test(line.trim()));
  if (!attached) {
    throw new Error(
      `MTS-012 image harness: platform "android" cannot be captured; no android device is attached (adb devices found no device in "device" state)`,
    );
  }
}

function waitForAndroidBoot() {
  adb(["wait-for-device"]);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (adb(["shell", "getprop", "sys.boot_completed"]).trim() === "1") {
      break;
    }
    // Synchronous sleep (execFileSync context) via Atomics.wait.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }
  // sys.boot_completed=1 fires while the activity/package managers are still
  // coming up after a framework restart; wait until `pm` answers so the
  // subsequent force-stop/start commands cannot race the boot.
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      adb(["shell", "pm", "path", "android"]);
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
    }
  }
  throw new Error(
    "MTS-012 image harness: android package manager did not become ready within 120s",
  );
}

/**
 * Re-assert runtime-wide Android capture state. Locale changes restart the
 * Android framework and SystemUI, so settings applied only when the session
 * first opens are not enough to guarantee the next framebuffer has the same
 * system-bar/window state. Calling this before every capture makes the first
 * post-restart frame and subsequent frames use the same runtime policy.
 */
function applyAndroidRuntimeConfig() {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      adb(["reverse", `tcp:${ANDROID_CAPTURE_PORT}`, `tcp:${ANDROID_CAPTURE_PORT}`]);
      adb(["shell", "settings", "put", "global", "policy_control", "immersive.full=*"]);
      adb(["shell", "settings", "put", "global", "window_animation_scale", "0"]);
      adb(["shell", "settings", "put", "global", "transition_animation_scale", "0"]);
      adb(["shell", "settings", "put", "global", "animator_duration_scale", "0"]);
      adb(["shell", "svc", "power", "stayon", "true"]);
      adb(["shell", "wm", "dismiss-keyguard"]);
      const policyControl = adb([
        "shell",
        "settings",
        "get",
        "global",
        "policy_control",
      ]).trim();
      if (policyControl !== "immersive.full=*") {
        throw new Error(
          `MTS-012 image harness: immersive system-bar policy did not settle ` +
            `(expected "immersive.full=*", got "${policyControl}")`,
        );
      }
      // `settings put` is synchronous but SystemUI applies the changed policy
      // on its own loop. Give that observer a bounded moment before launching
      // the activity so the ready signal cannot race transitioning insets.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
      return;
    } catch (cause) {
      lastError = cause;
      // After adb root or a framework locale restart, `pm` may already answer
      // while Binder services such as `settings`/`window` are still being
      // registered. All commands above are idempotent, so retry the complete
      // runtime policy until the services actually accept it.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `MTS-012 image harness: android runtime/SystemUI configuration did not become ready ` +
      `within 120s (${detail})`,
  );
}

/** @type {import("node:http").Server | undefined} */
let androidConfigServer;
/** @type {Record<string, any> | undefined} */
let androidPendingConfig;
/** @type {((value?: unknown) => void) | undefined} */
let androidReadyResolver;
/** @type {string | undefined} */
let androidLastSize;
/** @type {string | undefined} */
let androidLastLocale;
/** @type {string | undefined} */
let androidLastFontScale;
/** @type {Promise<void> | undefined} */
let androidSessionPromise;

/**
 * Open the deterministic android capture session exactly once per process:
 * adb reverse on the fixed port, the config/ready loopback server, and the
 * display configuration that makes framebuffer captures pixel-exact
 * (immersive system bars, no animations, screen stay-on, keyguard
 * dismissed). All of it is device configuration, never app code.
 */
function openAndroidSession() {
  androidSessionPromise ??= (async () => {
    requireAndroidDevice();
    waitForAndroidBoot();
    // The device locale switch needs persist.* setprop access; the
    // google_apis emulator images (CI and local) allow adb root.
    adb(["root"]);
    waitForAndroidBoot();
    applyAndroidRuntimeConfig();
    // Right after `adb root` the activity manager can briefly fail to
    // resolve activities even though `pm path android` answers; poll until
    // the harness activity resolves (bounded).
    let resolvedActivity = "";
    for (let attempt = 0; attempt < 30; attempt += 1) {
      resolvedActivity = adb([
        "shell",
        "cmd",
        "package",
        "resolve-activity",
        "--brief",
        ANDROID_CAPTURE_PACKAGE,
      ]).trim();
      if (resolvedActivity.includes(`${ANDROID_CAPTURE_PACKAGE}/.MainActivity`)) {
        break;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
    }
    if (!resolvedActivity.includes(`${ANDROID_CAPTURE_PACKAGE}/.MainActivity`)) {
      throw new Error(
        `MTS-012 image harness: the harness app ${ANDROID_CAPTURE_PACKAGE} is not installed/resolvable (got "${resolvedActivity}"); build and install the harness APK first (see tests/mts-012/README.md)`,
      );
    }
    await new Promise((resolveListen, rejectListen) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${ANDROID_CAPTURE_PORT}`);
        if (url.pathname === "/config.json" && req.method === "GET") {
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify(androidPendingConfig ?? {}));
        } else if (url.pathname === "/ready" && req.method === "POST") {
          let rawBody = "";
          req.setEncoding("utf8");
          req.on("data", (chunk) => {
            rawBody += chunk;
          });
          req.on("end", () => {
            res.statusCode = 204;
            res.end();
            // The ready ack carries the config the app ACTUALLY rendered.
            // Only an ack matching the currently requested combo releases
            // the capture: a stale process still showing a previous combo
            // (observed as a wrong-but-plausible frame during the launch
            // race window) can never satisfy this check, so the launcher
            // relaunches instead of capturing a poisoned frame.
            const pending = androidPendingConfig;
            let ack = /** @type {Record<string, unknown>} */ ({});
            try {
              ack = JSON.parse(rawBody) ?? {};
            } catch {
              // Non-JSON or bodyless ack (e.g. a harness APK built without
              // the ack payload) can never release the capture.
            }
            const expectedScale = pending?.textScale === 2 ? 2 : 1;
            // The app acks the actual pixel density ratio it rendered with
            // (PixelRatio.get(); 1.0 at the harness's pinned 160dpi). Only a
            // frame rendered at 1x density can release the capture: a fresh
            // activity launched before the density override propagates
            // reports a stale ratio (e.g. 2.625 at the AVD's 420dpi) and
            // lays out the whole surface at a tiny logical width — a
            // wrong-but-plausible poisoned frame.
            const matches =
              pending !== undefined &&
              ack.surface === pending.surface &&
              ack.mode === pending.mode &&
              ack.locale === pending.locale &&
              Math.round(Number(ack.fontScale)) === expectedScale &&
              Math.round(Number(ack.scale)) === 1;
            if (matches) {
              const resolveReady = androidReadyResolver;
              androidReadyResolver = undefined;
              if (resolveReady !== undefined) {
                resolveReady();
              }
            }
          });
        } else {
          res.statusCode = 404;
          res.end("not found");
        }
      });
      server.on("error", rejectListen);
      server.listen(ANDROID_CAPTURE_PORT, "127.0.0.1", () => {
        androidConfigServer = server;
        resolveListen(undefined);
      });
    });
  })();
  return androidSessionPromise;
}

/**
 * Switch the device locale deterministically (framework restart) so the
 * REAL device-catalog path (expo-localization) resolves the same catalog
 * the web layer pins via the browser locale.
 * @param {"en" | "zh-HK"} locale
 */
function setAndroidLocale(locale) {
  const target = locale === "en" ? "en-US" : "zh-HK";
  const current = adb(["shell", "getprop", "persist.sys.locale"]).trim();
  // A fresh emulator is already en-US even when persist.sys.locale is
  // still empty; restarting the framework for an already-active locale is
  // needless (a framework restart takes minutes on a software emulator)
  // and would race the launch that follows.
  if (current === target || (target === "en-US" && current === "")) {
    return;
  }
  if (locale === "en") {
    adb(["shell", "setprop", "persist.sys.locale", "en-US"]);
    adb(["shell", "setprop", "persist.sys.language", "en"]);
    adb(["shell", "setprop", "persist.sys.country", "US"]);
    adb(["shell", "setprop", "persist.sys.region", "US"]);
  } else {
    adb(["shell", "setprop", "persist.sys.locale", "zh-HK"]);
    adb(["shell", "setprop", "persist.sys.language", "zh"]);
    adb(["shell", "setprop", "persist.sys.country", "HK"]);
    adb(["shell", "setprop", "persist.sys.region", "HK"]);
  }
  adb(["shell", "stop"]);
  adb(["shell", "start"]);
  waitForAndroidBoot();
}

/**
 * Pin the logical size and 1x density for a combo, then WAIT until the
 * window manager actually reports the overrides: on the software-rendered
 * CI emulator (no KVM) the display config change propagates asynchronously,
 * and an activity launched before it settles renders at the stale density
 * (e.g. the AVD's 420dpi) — a plausible-looking but poisoned frame. The
 * ready-ack scale check below is the authoritative guard; this readback
 * just avoids wasting relaunch cycles. The size/density report formats vary
 * across Android versions ("360x800" vs "360 x 800"), so the matchers
 * tolerate both.
 * @param {string} size
 */
function setAndroidDisplayConfig(size) {
  adb(["shell", "wm", "size", size]);
  adb(["shell", "wm", "density", "160"]);
  const [requestedWidth, requestedHeight] = size.split("x");
  const requestedSizePattern = new RegExp(
    `Override size:\s*${requestedWidth}\s*x\s*${requestedHeight}(?:\s|$)`,
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const sizeOut = adb(["shell", "wm", "size"]);
    const densityOut = adb(["shell", "wm", "density"]);
    const sizeOk = requestedSizePattern.test(sizeOut);
    const densityOk = /Override density:\s*160/.test(densityOut);
    if (sizeOk && densityOk) {
      return;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
  }
  throw new Error(
    `MTS-012 image harness: window manager did not report the requested display config ` +
      `(${size} @ 160dpi) within 60s`,
  );
}

/**
 * Capture one deterministic PNG of a REAL Misyra surface from the actual
 * Android framebuffer: pin the logical size and 1x density, the system text
 * scale, and the device locale; relaunch the harness activity so every
 * capture renders in a fresh runtime; wait for the in-app ready signal;
 * then grab `screencap`.
 * @param {ImageCombo} combo
 * @returns {Promise<Buffer>}
 */
async function captureAndroidScreenshot(combo) {
  await openAndroidSession();
  const size = `${combo.width}x${combo.height}`;
  const fontScale = combo.textScale === 2 ? "2.0" : "1.0";

  // Locale changes restart the Android framework. Apply that restart before
  // display size/density and font scale so this same capture — not merely the
  // next one — is rendered with the complete requested device configuration.
  if (combo.locale !== androidLastLocale) {
    setAndroidLocale(combo.locale);
    androidLastLocale = combo.locale;
    androidLastSize = undefined;
    androidLastFontScale = undefined;
  }
  // Reassert runtime/SystemUI policy for every capture. This is deliberately
  // symmetric: the first capture after a locale restart and the unchanged
  // repeat capture must enter the activity from the same system-bar state.
  applyAndroidRuntimeConfig();
  if (size !== androidLastSize) {
    setAndroidDisplayConfig(size);
    androidLastSize = size;
  }
  if (fontScale !== androidLastFontScale) {
    adb(["shell", "settings", "put", "system", "font_scale", fontScale]);
    androidLastFontScale = fontScale;
  }
  androidPendingConfig = {
    surface: combo.surface,
    mode: combo.appearance,
    locale: combo.locale,
    textScale: combo.textScale,
  };
  // The app acks the config it actually rendered (see native-entry.tsx);
  // only a matching ack releases the capture. Relaunch (bounded) when no
  // matching ack arrives: a stale process still showing a previous combo
  // can never satisfy the ack check, so a wrong-but-plausible frame is
  // never captured.
  let captured = false;
  for (let attempt = 0; attempt < 5 && !captured; attempt += 1) {
    const ready = new Promise((resolveReady) => {
      androidReadyResolver = resolveReady;
    });
    adb(["shell", "am", "force-stop", ANDROID_CAPTURE_PACKAGE]);
    // Right after a framework restart the activity manager can briefly
    // reject launches; poll the exact operation we need (bounded) instead
    // of racing. GitHub-hosted emulator runners have no KVM, so a single
    // `am start` can legitimately fail for minutes while the software
    // emulator settles — budget generously (90 x 2s = 180s).
    let launched = false;
    for (let startAttempt = 0; startAttempt < 90 && !launched; startAttempt += 1) {
      try {
        adb(["shell", "am", "start", "-n", `${ANDROID_CAPTURE_PACKAGE}/.MainActivity`]);
        launched = true;
      } catch {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
      }
    }
    if (!launched) {
      throw new Error(
        `MTS-012 image harness: could not start ${ANDROID_CAPTURE_PACKAGE}/.MainActivity after 180s`,
      );
    }
    let readyTimer;
    let signalled = false;
    try {
      await Promise.race([
        ready,
        new Promise((_, rejectReady) => {
          readyTimer = setTimeout(() => {
            rejectReady(
              new Error(
                "MTS-012 image harness: android capture timed out waiting for a matching harness ready signal (120s)",
              ),
            );
          }, 120_000);
        }),
      ]);
      signalled = true;
    } catch {
      // No matching ack (stale process or still-settling launch): relaunch.
    } finally {
      clearTimeout(readyTimer);
    }
    if (signalled) {
      captured = true;
    }
  }
  if (!captured) {
    throw new Error(
      `MTS-012 image harness: android capture could not obtain a matching ready signal ` +
        `for ${combo.surface} ${combo.width}x${combo.height} ${combo.appearance} ${combo.locale} ` +
        `${combo.textScale}x after 5 relaunches`,
    );
  }
  // One extra settled frame after the ready signal, then grab the buffer.
  // The software-rendered CI emulator (no KVM) commits frames slowly;
  // give it more settle time than a hardware device needs.
  await new Promise((resolveSettle) => setTimeout(resolveSettle, 1_500));
  return adbBinary(["exec-out", "screencap", "-p"]);
}

/**
 * Capture one deterministic PNG screenshot of a REAL Misyra surface.
 * @param {ImageCombo & { platform: string }} combo
 * @returns {Promise<Buffer>}
 */
export async function captureScreenshot(combo) {
  validateCombo(combo);
  if (combo.platform === "android") {
    return captureAndroidScreenshot(combo);
  }
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
