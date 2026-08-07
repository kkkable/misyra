/**
 * Start the misyra-local development services and wait for readiness.
 *
 * Ensures a root .env exists (seeded from local.env.example on first use),
 * then brings the Compose project up and blocks until every service passes
 * its healthcheck. Fails clearly when Docker or a service is unavailable.
 */
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repoRoot, runCompose } from "./local-services.mjs";

const envFile = join(repoRoot, ".env");
const template = join(repoRoot, "local.env.example");

if (!existsSync(envFile)) {
  copyFileSync(template, envFile);
  console.log("Created .env from local.env.example (local development defaults).");
}

console.log("Starting misyra-local services (postgres, azurite)...");
const up = runCompose(["up", "--detach", "--wait", "--wait-timeout", "180"]);
if (up.stdout.trim()) console.log(up.stdout.trim());
if (up.status !== 0) {
  console.error(up.stderr.trim() || "docker compose up failed");
  console.error("Local services are unavailable. Check Docker Desktop and retry pnpm dev:up.");
  process.exit(1);
}

console.log("misyra-local is healthy:");
console.log("  postgres: localhost (see .env for the deterministic credentials)");
console.log("  azurite:  blob/queue/table on the .env ports (devstoreaccount1)");
