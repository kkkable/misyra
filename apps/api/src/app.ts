/**
 * Fastify application factory for the Misyra API shell (MTS-003) with the
 * MTS-005 health surface.
 *
 * The shell boots without any Apple, Google, Azure, AI, database, or other
 * provider credentials. Product routes belong to later tickets; MTS-005
 * owns the content-free liveness and dependency-aware readiness behavior.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { registerHealthRoutes, type DependencyProbe } from "./health.js";

/** Options accepted by the API shell. */
export interface AppOptions {
  /**
   * Environment visible to the shell. Nothing in the shell requires a
   * credential value here; the option exists so smoke tests can prove
   * startup with a deliberately empty environment and so /health/ready can
   * resolve the MTS-004 dependency ports with Compose-compatible semantics.
   */
  env?: Readonly<Record<string, string | undefined>>;
  /**
   * Override the dependency probe used by /health/ready. Tests inject
   * deterministic fakes; the default probes the local PostgreSQL and
   * Azurite ports on 127.0.0.1.
   */
  healthProbe?: DependencyProbe;
  /** .env source for readiness port resolution; defaults to the repository root .env. */
  envFilePath?: string | undefined;
}

/**
 * Build the Fastify application without binding a port.
 *
 * @param options shell options; credentials are never required.
 */
export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });
  await registerHealthRoutes(app, {
    env: options.env,
    envFilePath: options.envFilePath,
    probe: options.healthProbe,
  });
  return app;
}
