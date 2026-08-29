import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mainPath = join(root, "infra", "azure", "main.bicep");
const parameterPaths = [
  join(root, "infra", "azure", "parameters", "development.bicepparam"),
  join(root, "infra", "azure", "parameters", "staging.bicepparam"),
  join(root, "infra", "azure", "parameters", "production.bicepparam"),
];

function run(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 50 * 1024 * 1024,
  });
}

function commandAvailable(command, args) {
  const result = run(command, args);
  return result.status === 0;
}

function selectCompiler() {
  if (commandAvailable("bicep", ["--version"])) {
    return { kind: "standalone", command: "bicep" };
  }

  if (commandAvailable("az", ["bicep", "version"])) {
    return { kind: "azure-cli", command: "az" };
  }

  throw new Error(
    "Bicep compiler is unavailable. Install the standalone Bicep CLI or Azure CLI with Bicep support.",
  );
}

function compile(compiler, action, path) {
  const args =
    compiler.kind === "standalone"
      ? [action, path, "--stdout"]
      : ["bicep", action, "--file", path, "--stdout"];
  const result = run(compiler.command, args);

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `${compiler.command} ${args.join(" ")} failed with exit code ${String(result.status)}${
        details ? `:\n${details}` : ""
      }`,
    );
  }
}

try {
  const compiler = selectCompiler();
  compile(compiler, "build", mainPath);
  for (const path of parameterPaths) {
    compile(compiler, "build-params", path);
  }
  console.log("MTS-006 Bicep validation passed for development, staging, and production shapes.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
