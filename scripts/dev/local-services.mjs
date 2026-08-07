/**
 * Shared helpers for the MTS-004 local development service tooling.
 *
 * Every helper depends only on the Node.js standard library plus the Docker
 * CLI so the scripts stay portable across Windows PowerShell and Linux.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Compose project name pinned by compose.yaml; reset scope never leaves it. */
export const COMPOSE_PROJECT = "misyra-local";

/** Misyra-owned named volumes declared by compose.yaml. */
export const COMPOSE_VOLUMES = ["misyra-postgres-data", "misyra-azurite-data"];

/**
 * Deterministic local service configuration. Environment overrides win so
 * developers can move ports without editing compose.yaml; defaults mirror
 * the compose.yaml interpolation fallbacks exactly.
 */
export const serviceConfig = {
  postgresUser: process.env.MISYRA_POSTGRES_USER ?? "misyra",
  postgresPassword: process.env.MISYRA_POSTGRES_PASSWORD ?? "misyra_local_dev",
  postgresDb: process.env.MISYRA_POSTGRES_DB ?? "misyra",
  postgresPort: Number(process.env.MISYRA_POSTGRES_PORT ?? 5432),
  azuriteBlobPort: Number(process.env.MISYRA_AZURITE_BLOB_PORT ?? 10000),
  azuriteQueuePort: Number(process.env.MISYRA_AZURITE_QUEUE_PORT ?? 10001),
  azuriteTablePort: Number(process.env.MISYRA_AZURITE_TABLE_PORT ?? 10002),
};

/**
 * Resolve the Docker CLI binary. PATH wins; on Windows the standard Docker
 * Desktop install location is tried as a fallback so the scripts work even
 * before the installer's PATH change reaches the current session.
 *
 * @returns {string}
 */
export function resolveDockerBin() {
  if (process.env.MISYRA_DOCKER_BIN) return process.env.MISYRA_DOCKER_BIN;
  const fallback = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
  if (process.platform === "win32" && existsSync(fallback)) return fallback;
  return "docker";
}

/**
 * Run a docker compose command synchronously from the repository root.
 *
 * @param {readonly string[]} args compose arguments, e.g. ["up", "-d"]
 * @returns {{ status: number; stdout: string; stderr: string }}
 */
export function runCompose(args) {
  const result = spawnSync(resolveDockerBin(), ["compose", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) {
    return {
      status: 1,
      stdout: "",
      stderr: `Docker CLI unavailable (${result.error.message}). Install Docker Desktop or set MISYRA_DOCKER_BIN.`,
    };
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/**
 * TCP-probe localhost ports and report each dependency's reachability.
 *
 * @param {ReadonlyArray<{ name: string; port: number }>} probes
 * @returns {Promise<Array<{ name: string; port: number; ok: boolean; detail: string }>>}
 */
export async function probeLocalPorts(probes) {
  const { connect } = await import("node:net");
  const results = [];
  for (const probe of probes) {
    const detail = await new Promise((resolvePromise) => {
      const socket = connect({ host: "127.0.0.1", port: probe.port });
      const finish = (ok, message) => {
        socket.destroy();
        resolvePromise(message ? `${message}` : ok ? "reachable" : "unreachable");
      };
      socket.setTimeout(2000);
      socket.once("connect", () => finish(true, ""));
      socket.once("timeout", () => finish(false, "connection timed out"));
      socket.once("error", (error) => finish(false, /** @type {Error} */ (error).message));
    });
    results.push({ ...probe, ok: detail === "reachable", detail });
  }
  return results;
}
