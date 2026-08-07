/**
 * Build script for @misyra/mobile (MTS-003).
 *
 * Build mode proves the Expo/Expo Router project is structurally valid by
 * bundling the native JavaScript with `expo export` (no native toolchain or
 * credentials required); the bundle output lands in dist/ and is
 * gitignored. Pass --no-emit for a strict typecheck-only compilation.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const noEmit = process.argv.includes("--no-emit");

/**
 * Resolve a workspace-local tool binary without relying on PATH shims.
 *
 * @param {string} packageName
 * @param {readonly string[]} binRelativePath
 */
function binEntry(packageName, binRelativePath) {
  return join(dirname(fileURLToPath(import.meta.resolve(packageName))), "..", ...binRelativePath);
}

if (noEmit) {
  const tscEntry = binEntry("typescript", ["bin", "tsc"]);
  const compile = spawnSync(
    process.execPath,
    [tscEntry, "--project", join(packageDir, "tsconfig.json"), "--noEmit"],
    { cwd: packageDir, encoding: "utf8" },
  );
  process.stdout.write(compile.stdout);
  process.stderr.write(compile.stderr);
  if (compile.status !== 0) {
    process.stderr.write("@misyra/mobile typecheck failed\n");
    process.exit(compile.status ?? 1);
  }
  process.stdout.write("@misyra/mobile typecheck ok\n");
} else {
  const expoCli = binEntry("expo", ["bin", "cli"]);
  const bundle = spawnSync(
    process.execPath,
    [expoCli, "export", "--platform", "ios", "--output-dir", "dist"],
    {
      cwd: packageDir,
      encoding: "utf8",
      env: { ...process.env, EXPO_NO_TELEMETRY: "1", CI: "1" },
    },
  );
  process.stdout.write(bundle.stdout);
  process.stderr.write(bundle.stderr);
  if (bundle.status !== 0) {
    process.stderr.write("@misyra/mobile build failed during expo export\n");
    process.exit(bundle.status ?? 1);
  }
  process.stdout.write("@misyra/mobile build ok\n");
}
