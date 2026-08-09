/**
 * MTS-005 health surface for the Misyra API.
 *
 * Liveness is content-free and never touches a dependency; readiness probes
 * the MTS-004 local PostgreSQL and Azurite endpoints with Compose-compatible
 * port resolution: a non-empty explicit environment value wins, then a
 * non-empty value from the repository root .env file (the override mechanism
 * `pnpm dev:up` documents), then the deterministic fallback that mirrors the
 * compose.yaml interpolation fallback exactly. Every response is a fixed
 * two-word JSON snapshot so no credential, connection string, environment
 * dump, stack trace, or user content can ever leak.
 */
import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root derived from this module (src/ and dist/ sit two levels under it). */
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Repository root .env that Docker Compose reads automatically. */
export const DEFAULT_ENV_FILE_PATH = resolve(repoRoot, ".env");

const ENV_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

/**
 * Parse the dotenv subset used by Misyra local development: KEY=VALUE lines,
 * blank lines, #-comments, and values optionally wrapped in matching single
 * or double quotes. Identical to the MTS-004 `parseEnvFile` contract so the
 * API's layer never diverges from what `scripts/dev` and Docker Compose see.
 * Escape sequences and multi-line values are intentionally unsupported.
 *
 * @param content raw .env text
 * @returns parsed values in file order
 */
export function parseEnvFile(content: string): Map<string, string> {
  const values = new Map<string, string>();
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

/** Local dependency endpoints the API readiness contract checks. */
export interface DependencyConfig {
  /** PostgreSQL TCP port on 127.0.0.1. */
  postgresPort: number;
  /** Azurite blob TCP port on 127.0.0.1. */
  azuriteBlobPort: number;
}

/** Reachability verdict for one dependency. */
export interface DependencyState {
  name: "postgres" | "azurite";
  ok: boolean;
}

/**
 * Deterministic dependency probe. Production uses localhost TCP probes;
 * tests inject fakes so dependency-down behavior is proven without Docker.
 */
export type DependencyProbe = (config: DependencyConfig) => Promise<readonly DependencyState[]>;

/** Options accepted by the Compose-compatible dependency config resolver. */
export interface ResolveDependencyConfigOptions {
  /**
   * .env source layered between the explicit environment and the
   * deterministic fallback; defaults to the repository root .env.
   * A missing file silently falls back to defaults.
   */
  envFilePath?: string | undefined;
}

/**
 * Compose-compatible port resolution with the same precedence Docker Compose
 * applies to compose.yaml interpolation: a value counts only when it is
 * present and non-empty, so an empty MISYRA_POSTGRES_PORT behaves exactly
 * like an unset variable, and an empty value from either source falls
 * through to the next layer (MTS-004 `${VAR:-fallback}` semantics). Defaults
 * mirror the compose.yaml interpolation fallbacks exactly.
 *
 * @param env environment visible to the API
 * @param options resolution options
 */
export function resolveDependencyConfig(
  env: Readonly<Record<string, string | undefined>>,
  options: ResolveDependencyConfigOptions = {},
): DependencyConfig {
  const envFilePath = options.envFilePath ?? DEFAULT_ENV_FILE_PATH;
  const fileValues = existsSync(envFilePath)
    ? parseEnvFile(readFileSync(envFilePath, "utf8"))
    : new Map<string, string>();
  const pick = (key: string, fallback: string): string => {
    const envValue = env[key];
    if (envValue !== undefined && envValue !== "") return envValue;
    const fileValue = fileValues.get(key);
    if (fileValue !== undefined && fileValue !== "") return fileValue;
    return fallback;
  };
  return {
    postgresPort: Number(pick("MISYRA_POSTGRES_PORT", "5432")),
    azuriteBlobPort: Number(pick("MISYRA_AZURITE_BLOB_PORT", "10000")),
  };
}

/**
 * Probe the MTS-004 local services on 127.0.0.1. A probe resolves true only
 * when the TCP port accepts a connection within the timeout; probing never
 * throws, so readiness status stays deterministic.
 *
 * @param config dependency endpoints to probe
 */
export async function probeDependencies(
  config: DependencyConfig,
): Promise<readonly DependencyState[]> {
  const probe = (name: "postgres" | "azurite", port: number): Promise<DependencyState> =>
    new Promise((resolve) => {
      const socket = connect({ host: "127.0.0.1", port });
      const finish = (ok: boolean): void => {
        socket.destroy();
        resolve({ name, ok });
      };
      socket.setTimeout(2000);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
    });
  return Promise.all([
    probe("postgres", config.postgresPort),
    probe("azurite", config.azuriteBlobPort),
  ]);
}

/** Options for wiring the health routes into a Fastify app. */
export interface HealthRoutesOptions {
  /** Environment used for port resolution; defaults to process.env. */
  env?: Readonly<Record<string, string | undefined>> | undefined;
  /** .env source for port resolution; defaults to the repository root .env. */
  envFilePath?: string | undefined;
  /** Dependency probe; defaults to localhost TCP probes. */
  probe?: DependencyProbe | undefined;
}

/**
 * Register the content-free liveness and dependency-aware readiness routes.
 *
 * - `GET /health/live`  -> `200 {"status":"ok"}` always (no dependency access).
 * - `GET /health/ready` -> `200 {"status":"ok"}` when every required
 *   dependency is available, otherwise `503 {"status":"unavailable"}`.
 *
 * @param app Fastify instance to decorate
 * @param options route wiring options
 */
export async function registerHealthRoutes(
  app: FastifyInstance,
  options: HealthRoutesOptions = {},
): Promise<void> {
  const env = options.env ?? process.env;
  const probe = options.probe ?? probeDependencies;

  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_request, reply) => {
    const config = resolveDependencyConfig(env, { envFilePath: options.envFilePath });
    const states = await probe(config);
    const ready = states.every((state) => state.ok);
    return reply.code(ready ? 200 : 503).send({ status: ready ? "ok" : "unavailable" });
  });
}
