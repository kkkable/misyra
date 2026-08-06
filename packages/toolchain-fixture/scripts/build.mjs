/**
 * Build probe for the MTS-002 toolchain fixture.
 *
 * Proves that Turborepo can schedule a workspace `build` task end to end and
 * that the shared strict TypeScript configuration emits real output. The
 * emitted dist/ is gitignored and exists only so the runtime public-import
 * proof has something to import.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const skipProof = process.argv.includes("--skip-proof");

// Resolve the workspace TypeScript compiler without relying on PATH shims.
const tscEntry = join(
  dirname(fileURLToPath(import.meta.resolve("typescript"))),
  "..",
  "bin",
  "tsc",
);

const compile = spawnSync(
  process.execPath,
  [
    tscEntry,
    "--project",
    join(packageDir, "tsconfig.json"),
    "--noEmit",
    "false",
    "--outDir",
    "dist",
  ],
  { cwd: packageDir, encoding: "utf8" },
);
process.stdout.write(compile.stdout);
process.stderr.write(compile.stderr);
if (compile.status !== 0) {
  process.stderr.write("@misyra/toolchain-fixture build failed during tsc emit\n");
  process.exit(compile.status ?? 1);
}
process.stdout.write("@misyra/toolchain-fixture build ok\n");

if (!skipProof) {
  await import("./public-import-proof.mjs");
}
