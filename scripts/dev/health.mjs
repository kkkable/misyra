/**
 * Deterministic health checks for the misyra-local development services.
 *
 * Modes:
 *   --full (default)  Compose container/healthcheck state plus localhost
 *                     TCP probes for PostgreSQL and Azurite.
 *   --ports-only      TCP probes only (no Docker required), useful for
 *                     failure-mode contracts and minimal environments.
 *
 * Every failure exits non-zero and names the unavailable dependency so the
 * tooling "fails clearly when a dependency is unavailable" (MTS-004).
 */
import { parseArgs } from "node:util";
import { probeLocalPorts, runCompose, serviceConfig } from "./local-services.mjs";

const { values } = parseArgs({
  options: {
    full: { type: "boolean", default: false },
    "ports-only": { type: "boolean", default: false },
    "postgres-port": { type: "string" },
    "azurite-blob-port": { type: "string" },
  },
  allowPositionals: false,
});

const postgresPort = Number(values["postgres-port"] ?? serviceConfig.postgresPort);
const azuriteBlobPort = Number(values["azurite-blob-port"] ?? serviceConfig.azuriteBlobPort);
const portsOnly = Boolean(values["ports-only"]);

/** @type {Array<{ name: string; ok: boolean; detail: string }>} */
const failures = [];

if (!portsOnly) {
  const ps = runCompose(["ps", "--format", "json"]);
  if (ps.status !== 0) {
    console.error("docker compose is unavailable: the local dependency services cannot run.");
    console.error(ps.stderr.trim());
    process.exit(1);
  }
  const states = new Map(
    ps.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map(
        (line) =>
          /** @type {{ Service: string; State: string; Health: string }} */ (JSON.parse(line)),
      )
      .map((entry) => [entry.Service, entry]),
  );
  for (const name of ["postgres", "azurite"]) {
    const service = states.get(name);
    if (!service) {
      failures.push({ name, ok: false, detail: "service is not defined in the Compose project" });
      continue;
    }
    const healthy = service.State === "running" && service.Health === "healthy";
    if (!healthy) {
      failures.push({
        name,
        ok: false,
        detail: `not healthy (state=${service.State}, health=${service.Health}); run pnpm dev:up`,
      });
    } else {
      console.log(`${name}: healthy (running, Compose healthcheck passing)`);
    }
  }
}

const probes = await probeLocalPorts([
  { name: "postgres", port: postgresPort },
  { name: "azurite", port: azuriteBlobPort },
]);
for (const probe of probes) {
  if (probe.ok) {
    console.log(`${probe.name}: healthy (localhost:${probe.port} reachable)`);
  } else {
    failures.push({
      name: probe.name,
      ok: false,
      detail: `unreachable on localhost:${probe.port} (${probe.detail}); the dependency is unavailable`,
    });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`${failure.name}: unavailable - ${failure.detail}`);
  }
  console.error("Local dependency health check failed. Start services with pnpm dev:up.");
  process.exit(1);
}

console.log("All local dependencies are healthy.");
