/**
 * MTS-012 harness runtime — loads the REAL application modules that the
 * manifest model derives its numbers from.
 *
 * Everything here is deterministic: dist packages are built on demand via
 * the same scripts the repository CI uses, and the primitives core is
 * compiled to a throwaway directory under node_modules (git-ignored) with
 * the TypeScript compiler already present in the workspace.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { repoRoot } from "../../toolchain/helpers.mjs";

const DESIGN_TOKENS_PKG = join(repoRoot, "packages", "design-tokens");
const LOCALIZATION_PKG = join(repoRoot, "packages", "localization");

/** Throwaway tsc output for the real primitives core (never committed). */
const CORE_OUT_DIR = join(repoRoot, "apps", "mobile", "node_modules", ".mts012-harness");
const TSC = join(repoRoot, "node_modules", "typescript", "bin", "tsc");

/**
 * Build a package's dist on demand with the same script CI uses.
 *
 * @param {string} entry dist entry file to check.
 * @param {string} packageRoot package directory containing scripts/build.mjs.
 */
function ensureBuilt(entry, packageRoot) {
  if (existsSync(entry)) {
    return;
  }
  const buildScript = join(packageRoot, "scripts", "build.mjs");
  execFileSync(process.execPath, [buildScript], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (!existsSync(entry)) {
    throw new Error(`MTS-012 harness: build did not produce ${entry}`);
  }
}

/** Compile the real primitives core.ts to the throwaway harness directory. */
function compileCore() {
  mkdirSync(CORE_OUT_DIR, { recursive: true });
  execFileSync(
    process.execPath,
    [
      TSC,
      join(repoRoot, "apps", "mobile", "src", "primitives", "core.ts"),
      "--outDir",
      CORE_OUT_DIR,
      "--module",
      "esnext",
      "--moduleResolution",
      "bundler",
      "--target",
      "es2022",
      "--skipLibCheck",
      "--esModuleInterop",
    ],
    { encoding: "utf8", stdio: "pipe" },
  );
  const out = join(CORE_OUT_DIR, "core.js");
  if (!existsSync(out)) {
    throw new Error(`MTS-012 harness: tsc did not produce ${out}`);
  }
}

/** The real compiled primitives core (MTS-009) — MIN_TOUCH_TARGET & friends. */
export const core = await loadCore();

/** The real design-token runtime (MTS-008) — themes, space, radius. */
export const tokens = await loadTokens();

/** The real localization runtime (MTS-003) — en / zh-HK catalogs. */
export const localization = await loadLocalization();

async function loadCore() {
  ensureBuilt(join(DESIGN_TOKENS_PKG, "dist", "index.js"), DESIGN_TOKENS_PKG);
  compileCore();
  const module = await import(pathToFileURL(join(CORE_OUT_DIR, "core.js")).href);
  return module;
}

async function loadTokens() {
  ensureBuilt(join(DESIGN_TOKENS_PKG, "dist", "index.js"), DESIGN_TOKENS_PKG);
  const module = await import(pathToFileURL(join(DESIGN_TOKENS_PKG, "dist", "index.js")).href);
  return module;
}

async function loadLocalization() {
  ensureBuilt(join(LOCALIZATION_PKG, "dist", "index.js"), LOCALIZATION_PKG);
  const module = await import(pathToFileURL(join(LOCALIZATION_PKG, "dist", "index.js")).href);
  return module;
}

/** Path of the throwaway tsc output dir (used by the baseline-update guard). */
export const coreOutDir = CORE_OUT_DIR;

/** True when the harness real-module loading path is functional. */
export const runtimeReady =
  dirname(CORE_OUT_DIR) === join(repoRoot, "apps", "mobile", "node_modules");
