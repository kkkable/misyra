#!/usr/bin/env node
/**
 * MTS-007 deterministic secret-scan gate.
 *
 * Scans git-tracked files (default) or explicit paths (arguments) for
 * high-signal secret patterns. Never prints matched values — only file
 * paths and rule names — so the gate itself cannot leak material. The
 * documented fixture directory tests/mts-007/fixtures/secrets is skipped in
 * default repository-wide mode only; passing it explicitly (as the
 * contract tests do) proves detection.
 *
 * Exit code 0 = clean, 1 = violations found, 2 = usage/scan error.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const FIXTURE_PREFIX = "tests/mts-007/fixtures/secrets";

const RULES = [
  ["aws-access-key-id", /\bAKIA[0-9A-Z]{16}\b/],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
  ["azure-storage-account-key", /AccountKey=[A-Za-z0-9+/]{40,}={0,2}/],
  ["private-key-block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  [
    "generic-secret-assignment",
    /\b(?:password|passwd|client[_-]?secret|api[_-]?key|access[_-]?key|secret[_-]?key|connection[_-]?string)\s*[:=]\s*["'][^"'\r\n]{12,}["']/i,
  ],
];

function posix(path) {
  return path.split("\\").join("/");
}

function gitTracked() {
  const result = spawnSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`secret scan: git ls-files failed: ${result.stderr}`);
    process.exit(2);
  }
  return result.stdout.split(/\r?\n/).filter(Boolean).map(posix);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      out.push(...walk(abs));
    } else {
      out.push(abs);
    }
  }
  return out;
}

function scan(files) {
  const violations = [];
  for (const abs of files) {
    const relPosix = posix(relative(ROOT, abs));
    let content;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue; // unreadable files are not scanned
    }
    for (const [name, pattern] of RULES) {
      if (pattern.test(content)) {
        violations.push(`${relPosix}: ${name}`);
      }
    }
  }
  return violations;
}

const explicit = process.argv.slice(2);
let files;
if (explicit.length > 0) {
  files = [];
  for (const entry of explicit) {
    const abs = resolve(ROOT, entry);
    if (!existsSync(abs)) {
      console.error(`secret scan: no such path: ${entry}`);
      process.exit(2);
    }
    files.push(...(statSync(abs).isDirectory() ? walk(abs) : [abs]));
  }
} else {
  files = gitTracked()
    .filter((file) => !file.startsWith(FIXTURE_PREFIX))
    .map((file) => resolve(ROOT, file));
}

const violations = scan(files);
for (const violation of violations) {
  console.log(violation);
}
if (violations.length > 0) {
  console.log(`secret scan: ${violations.length} violation(s) found`);
  process.exitCode = 1;
} else {
  console.log("secret scan: clean");
}
