/**
 * MTS-001 contract: package manager and engine pins.
 *
 * Verifies that the repository pins pnpm through `packageManager`, targets
 * Node.js 24 LTS through `engines`, and that the active pnpm binary matches
 * the pinned version.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileExists, readJson, readText, run } from "./helpers.mjs";

const PACKAGE_MANAGER_PATTERN = /^pnpm@\d+\.\d+\.\d+$/;

test("root package.json exists", () => {
  assert.ok(fileExists("package.json"), "expected package.json at the repository root");
});

test("package.json pins the package manager through packageManager", () => {
  const root = readJson("package.json");
  assert.equal(typeof root.packageManager, "string", "packageManager field is missing");
  assert.match(root.packageManager, PACKAGE_MANAGER_PATTERN, "packageManager must pin an exact pnpm version");
});

test("package.json declares the Node.js 24 LTS engine target", () => {
  const root = readJson("package.json");
  const node = root.engines?.node;
  assert.equal(typeof node, "string", "engines.node is missing");
  assert.match(node, /24/, "engines.node must target the Node.js 24 LTS line");
  assert.ok(!node.includes("<"), "engines.node must not allow pre-24 runtimes");
});

test("the root workspace is private and is named misyra", () => {
  const root = readJson("package.json");
  assert.equal(root.name, "misyra");
  assert.equal(root.private, true, "the root workspace must never be publishable");
});

test("the active pnpm binary matches the pinned packageManager version", () => {
  const root = readJson("package.json");
  const pinned = root.packageManager.split("@")[1];
  const actual = run("pnpm", ["--version"]);
  assert.equal(actual, pinned, "resolved pnpm version must match the packageManager pin");
});

test("corepack can resolve the pinned package manager", () => {
  const root = readJson("package.json");
  const pinned = root.packageManager.split("@")[1];
  const actual = run("corepack", ["pnpm", "--version"]);
  assert.equal(actual, pinned, "corepack must resolve the exact pinned pnpm version");
});

test("pnpm-workspace.yaml exists so pnpm owns workspace discovery", () => {
  assert.ok(fileExists("pnpm-workspace.yaml"), "expected pnpm-workspace.yaml at the repository root");
  const text = readText("pnpm-workspace.yaml");
  assert.match(text, /^packages\s*:/m, "pnpm-workspace.yaml must declare a packages list");
});
