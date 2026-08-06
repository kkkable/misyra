/**
 * Shared helpers for MTS-001 toolchain contract tests.
 *
 * These helpers intentionally depend only on the Node.js standard library so
 * the contract tests can run before any dependency installation.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Read and JSON-parse a file relative to the repository root. */
export function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
}

/** Read a text file relative to the repository root. */
export function readText(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

/** True when the path exists and is a regular file. */
export function fileExists(relativePath) {
  try {
    return statSync(join(repoRoot, relativePath)).isFile();
  } catch {
    return false;
  }
}

/**
 * Minimal parser for the subset of pnpm-workspace.yaml used by this repo:
 * a top-level `packages:` list of quoted or unquoted glob entries.
 */
export function parseWorkspacePackages(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const packages = [];
  let inPackages = false;
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "");
    if (/^packages\s*:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const item = line.match(/^\s*-\s*(.+?)\s*$/);
      if (item) {
        packages.push(item[1].replace(/^["']|["']$/g, ""));
        continue;
      }
      if (line.trim() !== "") inPackages = false;
    }
  }
  return packages;
}

/** Expand a single-segment workspace glob such as `packages/*` into directories. */
export function globWorkspaceDirs(pattern) {
  const match = pattern.match(/^(.+?)\/\*$/);
  if (!match) throw new Error(`Unsupported workspace glob: ${pattern}`);
  const base = join(repoRoot, ...match[1].split("/"));
  let entries;
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => join(base, entry.name));
}

/** Directories of every workspace declared by pnpm-workspace.yaml. */
export function workspaceDirs() {
  const patterns = parseWorkspacePackages(readText("pnpm-workspace.yaml"));
  return patterns.flatMap((pattern) => globWorkspaceDirs(pattern));
}

/** Recursively collect files matching a predicate, skipping ignored directories. */
export function walkFiles(dir, matches, skip = new Set(["node_modules", ".git"])) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skip.has(entry.name)) results.push(...walkFiles(full, matches, skip));
    } else if (matches(entry.name)) {
      results.push(relative(repoRoot, full).split(sep).join("/"));
    }
  }
  return results;
}

/** Run a command from the repo root and return trimmed stdout. */
export function run(command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  }).trim();
}

/** Files tracked by git (empty list before the first commit). */
export function gitTrackedFiles() {
  try {
    const out = run("git", ["ls-files"]);
    return out === "" ? [] : out.split(/\r?\n/);
  } catch {
    return [];
  }
}
