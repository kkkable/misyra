/**
 * Fixture runners shared with the MTS-002 expected-failure contract tests.
 *
 * Expected-failure fixtures must assert the exact failure reason, so these
 * runners capture the full combined output and exit code of the invoked tool
 * instead of accepting any nonzero exit.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { repoRoot } from "../toolchain/helpers.mjs";

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
 *
 * @param {string} fileRelativePath
 * @returns {{ code: number | null, output: string }}
 */
export function runEslintOnFile(fileRelativePath) {
  return runTool("eslint", [
    "--no-config-lookup",
    "--config",
    join(repoRoot, "eslint.config.mjs"),
    "--format",
    "json",
    join(repoRoot, fileRelativePath),
  ]);
}
