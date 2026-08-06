/**
 * Fixture runners shared by the Misyra expected-failure contract tests.
 *
 * Expected-failure fixtures must assert the exact failure reason, so these
 * runners capture the full combined output and exit code of the invoked tool
 * instead of accepting any nonzero exit.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locate the repository root by walking up from this module until the
 * workspace declaration is found. Node realpaths workspace symlinks, so a
 * fixed number of parent hops is not reliable across layouts.
 *
 * @param {string} startDir
 * @returns {string}
 */
function findRepoRoot(startDir) {
  let current = startDir;
  for (;;) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("could not locate the repository root");
    current = parent;
  }
}

/** Repository root resolved from this package's physical location. */
export const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

/**
 * Run a repository-local tool from the repo root.
 *
 * @param {string} command
 * @param {readonly string[]} args
 * @returns {{ code: number | null, output: string }}
 */
export function runTool(command, args) {
  try {
    const output = execFileSync(command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    return { code: 0, output };
  } catch (error) {
    const failure = /** @type {{ status?: number | null, stdout?: unknown, stderr?: unknown }} */ (
      error
    );
    const output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
    return { code: typeof failure.status === "number" ? failure.status : null, output };
  }
}

/**
 * Run tsc with an explicit project file.
 *
 * @param {string} projectRelativePath
 * @returns {{ code: number | null, output: string }}
 */
export function runTsc(projectRelativePath) {
  return runTool("tsc", ["--noEmit", "--project", join(repoRoot, projectRelativePath)]);
}

/**
 * Run the repository ESLint config against a single file with JSON output.
 * Expected-failure fixtures are globally ignored for repository-wide lint
 * runs, so this runner lints them explicitly with --no-ignore.
 *
 * @param {string} fileRelativePath
 * @returns {{ code: number | null, output: string }}
 */
export function runEslintOnFile(fileRelativePath) {
  return runTool("eslint", [
    "--no-config-lookup",
    "--config",
    join(repoRoot, "eslint.config.mjs"),
    "--no-ignore",
    "--format",
    "json",
    join(repoRoot, fileRelativePath),
  ]);
}
