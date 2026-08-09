/**
 * MTS-005 health surface for the Misyra API.
 *
 * Liveness is content-free and never touches a dependency; readiness probes
 * the MTS-004 local PostgreSQL and Azurite endpoints with Compose-compatible
 * port resolution (non-empty environment value, then deterministic
 * fallback). Every response is a fixed two-word JSON snapshot so no
 * credential, connection string, environment dump, stack trace, or user
 * content can ever leak.
 */
import type { FastifyInstance } from "fastify";
import { connect } from "node:net";

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

/**
 * Compose-compatible port resolution: a value counts only when it is present
 * and non-empty, so an empty MISYRA_POSTGRES_PORT behaves exactly like an
 * unset variable (MTS-004 `${VAR:-fallback}` semantics). Defaults mirror the
 * compose.yaml interpolation fallbacks exactly.
 *
 * @param env environment visible to the API
 */
export function resolveDependencyConfig(
  env: Readonly<Record<string, string | undefined>>,
): DependencyConfig {
  const pick = (key: string, fallback: string): string => {
    const value = env[key];
    return value !== undefined && value !== "" ? value : fallback;
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
    const states = await probe(resolveDependencyConfig(env));
    const ready = states.every((state) => state.ok);
    return reply.code(ready ? 200 : 503).send({ status: ready ? "ok" : "unavailable" });
  });
}
