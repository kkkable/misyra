/**
 * MTS-001 contract: root script surface.
 *
 * Verifies that the repository exposes the agreed root commands and that
 * every script is a single portable invocation (no shell chaining or
 * POSIX-only utilities), so commands behave identically in Windows
 * PowerShell and Linux CI.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readJson } from "./helpers.mjs";

const REQUIRED_SCRIPTS = [
  "format",
  "format:check",
  "lint",
  "typecheck",
  "test",
  "build",
  "audit",
  "infra:validate",
];

const PORTABLE_RUNNERS = /^(node|pnpm|corepack|turbo|eslint|prettier|tsc)(\.c?js)?(\s|$)/;
const POSIX_ONLY_TOKENS = ["&&", "||", ";", "$(", "`", "export ", "rm ", "cp ", "mv ", "mkdir ", "cat ", " > "];

test("root package.json declares the full required script contract", () => {
  const { scripts } = readJson("package.json");
  assert.ok(scripts && typeof scripts === "object", "package.json scripts block is missing");
  for (const name of REQUIRED_SCRIPTS) {
    assert.equal(typeof scripts[name], "string", `missing required root script: ${name}`);
    assert.ok(scripts[name].trim().length > 0, `root script must not be empty: ${name}`);
  }
});

test("every root script is a single portable command", () => {
  const { scripts } = readJson("package.json");
  for (const [name, command] of Object.entries(scripts)) {
    assert.match(command, PORTABLE_RUNNERS, `script "${name}" must invoke a portable runner directly: ${command}`);
    for (const token of POSIX_ONLY_TOKENS) {
      assert.ok(!command.includes(token), `script "${name}" uses non-portable syntax "${token}": ${command}`);
    }
  }
});

test("the audit script enforces the high severity threshold", () => {
  const { scripts } = readJson("package.json");
  assert.match(scripts.audit, /audit-level=high/, "audit script must fail on high severity findings");
});

test("format ships both write and check modes", () => {
  const { scripts } = readJson("package.json");
  assert.match(scripts.format, /--write/, "format script must normalize files");
  assert.match(scripts["format:check"], /--check/, "format:check script must verify without writing");
});

test("typecheck is a no-emit TypeScript compilation", () => {
  const { scripts } = readJson("package.json");
  assert.match(scripts.typecheck, /tsc/, "typecheck script must run the TypeScript compiler");
  assert.match(scripts.typecheck, /--noEmit|-p /, "typecheck must not emit build output");
});

test("build runs through Turborepo", () => {
  const { scripts } = readJson("package.json");
  assert.match(scripts.build, /turbo run build/, "build script must delegate to Turborepo");
});
