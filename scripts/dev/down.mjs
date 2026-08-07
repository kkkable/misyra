/**
 * Stop the misyra-local development services while preserving local state.
 *
 * Volumes remain intact; use pnpm dev:reset --yes to remove state
 * intentionally.
 */
import { runCompose } from "./local-services.mjs";

const down = runCompose(["down"]);
if (down.stdout.trim()) console.log(down.stdout.trim());
if (down.status !== 0) {
  console.error(down.stderr.trim() || "docker compose down failed");
  process.exit(1);
}
console.log("misyra-local stopped; volumes preserved (pnpm dev:reset --yes removes them).");
