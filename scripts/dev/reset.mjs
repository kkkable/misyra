/**
 * Intentionally reset ALL Misyra-owned local development state.
 *
 * Removes the misyra-local containers, networks, and the misyra-postgres-data
 * and misyra-azurite-data volumes. The operation is guarded: it refuses to
 * run without --yes, supports --dry-run for a safe plan preview, and never
 * touches Docker resources outside the misyra-local Compose project.
 */
import { COMPOSE_PROJECT, COMPOSE_VOLUMES, runCompose } from "./local-services.mjs";

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const dryRun = args.includes("--dry-run");

if (!confirmed) {
  console.error("Refusing to reset: this destroys local PostgreSQL and Azurite data.");
  console.error("Re-run with --yes to confirm, e.g. pnpm dev:reset -- --yes");
  console.error("Add --dry-run to preview the exact scope without changing anything.");
  process.exit(2);
}

console.log(`Reset scope (Compose project "${COMPOSE_PROJECT}" only):`);
console.log("  - removes the postgres and azurite containers and their network");
console.log("  - removes the following named volumes:");
for (const volume of COMPOSE_VOLUMES) console.log(`    - ${volume}`);
console.log("  - leaves every other Docker resource untouched");

if (dryRun) {
  console.log("Dry run: no Docker resources were changed.");
  process.exit(0);
}

const reset = runCompose(["down", "--volumes", "--remove-orphans"]);
if (reset.stdout.trim()) console.log(reset.stdout.trim());
if (reset.status !== 0) {
  console.error(reset.stderr.trim() || "docker compose down --volumes failed");
  process.exit(1);
}
console.log("misyra-local state reset complete. Run pnpm dev:up to start fresh.");
