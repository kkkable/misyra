#!/usr/bin/env node
/**
 * MTS-008 forbidden hard-coded colour gate.
 *
 * Scans product / mobile UI source for raw colour literals that must come
 * from the centralized design tokens instead:
 *   - hex: `#RGB`, `#RRGGBB`, `#RGBA`, `#RRGGBBAA`;
 *   - functional: `rgb(r, g, b)`, `rgba(r, g, b, a)` with numeric channels.
 *
 * Deliberate non-goals (mirroring the approved scope):
 *   - packages/design-tokens is the colour *definition* and is never scanned;
 *   - generated/build output (`dist`, `.expo`, `.turbo`, `coverage`) and
 *     `node_modules` are never scanned as product source;
 *   - `hsl(...)` is not scanned (no approved palette uses it; the semantic
 *     palette is pinned by tests/mts-008/design-tokens.test.mjs).
 *
 * Only an exact, documented exception (file + line + literal value) may
 * suppress a finding, mirroring the approved audit-exception mechanism: the
 * shipped allowlist is empty and every exception must be declared
 * explicitly at the call site. The default repository gate scans
 * `apps/mobile` and must stay clean.
 *
 * Exit codes: 0 = clean, 1 = violations found, 2 = internal error.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root derived from this file's physical location. */
const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** Default scan root, relative to ROOT. */
const DEFAULT_SCAN_ROOT = "apps/mobile";

/** Directories that are never product source. */
const IGNORED_DIRS = new Set(["node_modules", "dist", ".expo", ".turbo", "coverage"]);

/** Extensions treated as product UI source. */
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** Raw hex colour literals (#RGB / #RRGGBB / #RGBA / #RRGGBBAA). */
const HEX_COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-fA-F])/g;

/** Raw rgb()/rgba() colour literals with numeric (integer or float) channels. */
const RGB_COLOR = /\brgba?\(\s*\d{1,3}(?:\.\d+)?(?:\s*,\s*\d{1,3}(?:\.\d+)?){2,3}\s*\)/g;

/** All matchers, in report order. */
const COLOR_PATTERNS = [HEX_COLOR, RGB_COLOR];

/**
 * The shipped exception allowlist: intentionally empty. Every exception must
 * be declared explicitly at the call site as { file, line, value, reason }.
 *
 * @type {{ file: string, line: number, value: string, reason?: string }[]}
 */
export const DEFAULT_EXCEPTIONS = [];

/**
 * Scan a list of files for forbidden colour literals.
 *
 * @param {{ files: string[], exceptions?: { file: string, line: number, value: string, reason?: string }[] }} options
 *   files: absolute (or consistent) paths to scan.
 *   exceptions: exact allowlist entries; a violation is suppressed only when
 *     file, line AND literal value all match.
 * @returns {{ violations: { file: string, line: number, value: string }[], scanned: string[] }}
 */
export function checkHardcodedColors({ files, exceptions = DEFAULT_EXCEPTIONS }) {
  const violations = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const pattern of COLOR_PATTERNS) {
      pattern.lastIndex = 0;
      let match = pattern.exec(text);
      while (match !== null) {
        const line = text.slice(0, match.index).split(/\r?\n/).length;
        const value = match[0];
        const documented = exceptions.some(
          (entry) => entry.file === file && entry.line === line && entry.value === value,
        );
        if (!documented) violations.push({ file, line, value });
        match = pattern.exec(text);
      }
    }
  }
  return { violations, scanned: files };
}

/**
 * Collect product source files below a directory.
 *
 * @param {string} scanRoot absolute directory to walk
 * @returns {string[]} absolute paths of scanned source files
 */
function collectSourceFiles(scanRoot) {
  /** @type {string[]} */
  const files = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (IGNORED_DIRS.has(name)) continue;
      const abs = join(dir, name);
      const info = statSync(abs);
      if (info.isDirectory()) walk(abs);
      else if (SCANNED_EXTENSIONS.has(extname(name))) files.push(abs);
    }
  };
  if (existsSync(scanRoot)) walk(scanRoot);
  return files;
}

/**
 * Default repository gate: scan apps/mobile and report.
 *
 * @returns {number} exit code
 */
function runDefaultGate() {
  const scanRoot = join(ROOT, DEFAULT_SCAN_ROOT);
  const files = collectSourceFiles(scanRoot);
  const { violations } = checkHardcodedColors({ files });
  if (violations.length === 0) {
    process.stdout.write(
      `hardcoded colour check: clean (${files.length} source file(s) scanned under ${DEFAULT_SCAN_ROOT})\n`,
    );
    return 0;
  }
  process.stderr.write(
    `hardcoded colour check: ${violations.length} violation(s) under ${DEFAULT_SCAN_ROOT}\n`,
  );
  for (const violation of violations) {
    process.stderr.write(
      `${relative(ROOT, violation.file)}:${violation.line}: ${violation.value}\n`,
    );
  }
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    process.exitCode = runDefaultGate();
  } catch (error) {
    process.stderr.write(`hardcoded colour check: internal error: ${String(error)}\n`);
    process.exitCode = 2;
  }
}
