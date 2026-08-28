import { spawnSync } from "node:child_process";
import process from "node:process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const command = process.argv[2];
const yes = process.argv.includes("--yes");

function fail(message) {
  throw new Error(message);
}

function runDocker(args, { capture = false } = {}) {
  const result = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    stdio: capture ? "pipe" : "inherit",
  });

  if (result.error?.code === "ENOENT") {
    fail(
      "Docker CLI is unavailable. Install or start Docker, then retry the local-service command.",
    );
  }

  if (result.error) {
    fail(`Docker command could not start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const details = capture
      ? (result.stderr || result.stdout || "").trim()
      : "";
    fail(`docker ${args.join(" ")} failed${details ? `: ${details}` : "."}`);
  }

  return result;
}

async function checkHealth() {
  runDocker(
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "sh",
      "-lc",
      'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ],
    { capture: true },
  );

  const portResult = runDocker(["compose", "port", "azurite", "10000"], {
    capture: true,
  });
  const published = portResult.stdout.trim().split(/\r?\n/)[0] ?? "";
  const portMatch = /:(\d+)$/.exec(published);

  if (!portMatch) {
    fail(
      `Azurite blob endpoint is unavailable; Docker Compose reported port mapping: ${published || "none"}`,
    );
  }

  let response;
  try {
    response = await fetch(
      `http://127.0.0.1:${portMatch[1]}/devstoreaccount1?comp=list`,
      {
        signal: AbortSignal.timeout(5_000),
      },
    );
  } catch (error) {
    fail(
      `Azurite blob endpoint is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (response.status >= 500) {
    fail(`Azurite blob endpoint returned unhealthy status ${response.status}.`);
  }

  console.log("Local PostgreSQL and Azurite services are healthy.");
}

async function main() {
  switch (command) {
    case "up":
      runDocker(["compose", "up", "-d", "--wait"]);
      await checkHealth();
      break;
    case "health":
      await checkHealth();
      break;
    case "reset":
      if (!yes) {
        fail(
          "Reset removes only the named local PostgreSQL and Azurite volumes. Re-run with --yes to confirm intentional local data reset.",
        );
      }
      runDocker(["compose", "down", "--volumes"]);
      console.log("Local PostgreSQL and Azurite state reset completed.");
      break;
    default:
      fail("Usage: node scripts/local-services.mjs <up|health|reset> [--yes]");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
