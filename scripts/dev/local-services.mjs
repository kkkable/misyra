/**
 * Shared helpers for the MTS-004 local development service tooling.
 *
 * Every helper depends only on the Node.js standard library plus the Docker
 * CLI so the scripts stay portable across Windows PowerShell and Linux.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Compose project name pinned by compose.yaml; reset scope never leaves it. */
export const COMPOSE_PROJECT = "misyra-local";

/** Misyra-owned named volumes declared by compose.yaml. */
export const COMPOSE_VOLUMES = ["misyra-postgres-data", "misyra-azurite-data"];

/** Repository root .env that Docker Compose reads automatically. */
export const ENV_FILE_PATH = resolve(repoRoot, ".env");

const ENV_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

/**
 * Parse the dotenv subset used by Misyra local development: KEY=VALUE lines,
 * blank lines, #-comments, and values optionally wrapped in matching single or
 * double quotes. Escape sequences and multi-line values are intentionally
 * unsupported so parsing stays deterministic and standard-library-only.
 *
 * @param {string} content raw .env text
 * @returns {Map<string, string>} parsed values in file order
 */
export function parseEnvFile(content) {
  const values = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const match = ENV_LINE.exec(line);
    if (!match) continue;
    let value = String(match[2]).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values.set(String(match[1]), value);
  }
  return values;
}

/**
 * Resolve the deterministic local service configuration with the same
 * precedence Docker Compose applies to compose.yaml interpolation: a value
 * already present in `env` wins, then the repository root .env file (the
 * override mechanism pnpm dev:up documents), then the deterministic default
 * that mirrors the compose.yaml interpolation fallback exactly.
 *
 * @param {object} [options]
 * @param {Record<string, string | undefined>} [options.env] explicit
 *   environment; defaults to process.env
 * @param {string} [options.envFilePath] .env source; defaults to the
 *   repository root .env. A missing file silently falls back to defaults.
 * @returns {{
 *   postgresUser: string;
 *   postgresPassword: string;
 *   postgresDb: string;
 *   postgresPort: number;
 *   azuriteBlobPort: number;
 *   azuriteQueuePort: number;
 *   azuriteTablePort: number;
 * }}
 */
export function resolveServiceConfig(options = {}) {
  const env = options.env ?? process.env;
  const envFilePath = options.envFilePath ?? ENV_FILE_PATH;
  const fileValues = existsSync(envFilePath)
    ? parseEnvFile(readFileSync(envFilePath, "utf8"))
    : new Map();
  /**
   * @param {string} key
   * @param {string} fallback
   * @returns {string}
   */
  const pick = (key, fallback) => env[key] ?? fileValues.get(key) ?? fallback;
  return {
    postgresUser: pick("MISYRA_POSTGRES_USER", "misyra"),
    postgresPassword: pick("MISYRA_POSTGRES_PASSWORD", "misyra_local_dev"),
    postgresDb: pick("MISYRA_POSTGRES_DB", "misyra"),
    postgresPort: Number(pick("MISYRA_POSTGRES_PORT", "5432")),
    azuriteBlobPort: Number(pick("MISYRA_AZURITE_BLOB_PORT", "10000")),
    azuriteQueuePort: Number(pick("MISYRA_AZURITE_QUEUE_PORT", "10001")),
    azuriteTablePort: Number(pick("MISYRA_AZURITE_TABLE_PORT", "10002")),
  };
}

/**
 * Deterministic local service configuration shared by dev:health and the
 * live integration suite. Environment overrides win so developers can move
 * ports without editing compose.yaml; defaults mirror the compose.yaml
 * interpolation fallbacks exactly.
 */
export const serviceConfig = resolveServiceConfig();

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
      /** @param {boolean} ok @param {string} message */
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
