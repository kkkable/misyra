/**
 * Build script for @misyra/database.
 *
 * Compiles the workspace with the shared strict TypeScript configuration and
 * emits the public entry point into dist/ so Turborepo schedules it like any
 * other build task. The dist/ output is gitignored. Pass --no-emit to run a
 * typecheck-only compilation.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const noEmit = process.argv.includes("--no-emit");

// Resolve the workspace TypeScript compiler without relying on PATH shims.
const tscEntry = join(
  dirname(fileURLToPath(import.meta.resolve("typescript"))),
  "..",
  "bin",
  "tsc",
);

/** @type {string[]} */
const args = ["--project", join(packageDir, "tsconfig.json")];
if (noEmit) {
  args.push("--noEmit");
} else {
  args.push("--noEmit", "false", "--declaration", "--outDir", "dist");
}

const compile = spawnSync(process.execPath, [tscEntry, ...args], {
  cwd: packageDir,
  encoding: "utf8",
});
process.stdout.write(compile.stdout);
process.stderr.write(compile.stderr);
if (compile.status !== 0) {
  process.stderr.write(`@misyra/database ${noEmit ? "typecheck" : "build"} failed\n`);
  process.exit(compile.status ?? 1);
}
process.stdout.write(`@misyra/database ${noEmit ? "typecheck" : "build"} ok\n`);
