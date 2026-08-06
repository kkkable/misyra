/**
 * MTS-001 contract: repository hygiene.
 *
 * Verifies that Git ignores generated, secret, IDE, and operating-system
 * artifacts, that none of those artifacts are tracked, and that line endings
 * are normalized so Windows and Linux contributors see identical files.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileExists, gitTrackedFiles, readText } from "./helpers.mjs";

const REQUIRED_IGNORE_PATTERNS = [
  "node_modules",
  ".env",
  ".turbo",
  "dist",
  "coverage",
  ".DS_Store",
  "Thumbs.db",
  "*.log",
];

const FORBIDDEN_TRACKED_PATTERNS = [
  /(^|\/)node_modules\//,
  /(^|\/)\.env($|\.)/,
  /(^|\/)\.turbo\//,
  /(^|\/)dist\//,
  /(^|\/)coverage\//,
  /\.log$/,
  /\.DS_Store$/,
  /(^|\/)Thumbs\.db$/,
  /(^|\/)desktop\.ini$/,
  /(^|\/)\.vscode\//,
  /(^|\/)\.idea\//,
  /~$/,
];

test(".gitignore exists and covers generated, secret, IDE, and OS artifacts", () => {
  assert.ok(fileExists(".gitignore"), "expected .gitignore at the repository root");
  const text = readText(".gitignore");
  for (const pattern of REQUIRED_IGNORE_PATTERNS) {
    assert.ok(text.includes(pattern), `.gitignore must cover: ${pattern}`);
  }
});

test(".editorconfig exists so editors share formatting defaults", () => {
  assert.ok(fileExists(".editorconfig"), "expected .editorconfig at the repository root");
});

test(".gitattributes normalizes line endings to LF", () => {
  assert.ok(fileExists(".gitattributes"), "expected .gitattributes at the repository root");
  assert.match(readText(".gitattributes"), /eol=lf/, "repository must normalize text files to LF");
});

test("no forbidden artifact is tracked by git", () => {
  const tracked = gitTrackedFiles();
  const violations = tracked.filter((file) => FORBIDDEN_TRACKED_PATTERNS.some((pattern) => pattern.test(file)));
  assert.deepEqual(violations, [], `forbidden files tracked: ${violations.join(", ")}`);
});

test("the lockfile is the only dependency manifest artifact tracked", () => {
  const tracked = gitTrackedFiles();
  const foreign = tracked.filter((file) =>
    ["package-lock.json", "yarn.lock", "bun.lockb", "bun.lock", "npm-shrinkwrap.json"].some((name) =>
      file.endsWith(name),
    ),
  );
  assert.deepEqual(foreign, [], `foreign lockfiles tracked: ${foreign.join(", ")}`);
  assert.ok(tracked.includes("pnpm-lock.yaml"), "pnpm-lock.yaml must be tracked");
});
