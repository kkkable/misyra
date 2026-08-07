/**
 * Fastify application factory for the Misyra API shell (MTS-003).
 *
 * The shell boots without any Apple, Google, Azure, AI, database, or other
 * provider credentials. Product routes belong to later tickets; MTS-005
 * owns health/readiness behavior.
 */
import Fastify, { type FastifyInstance } from "fastify";

/** Options accepted by the API shell. */
export interface AppOptions {
  /**
   * Environment visible to the shell. Nothing in the MTS-003 shell requires
   * a value here; the option exists so smoke tests can prove startup with a
   * deliberately empty environment.
   */
  env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Build the Fastify application without binding a port.
 *
 * @param _options shell options; credentials are never required.
 */
export async function buildApp(_options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });
  return app;
}
