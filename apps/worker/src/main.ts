/**
 * Long-running entry point for the Misyra worker (MTS-003 shell plus the
 * MTS-005 independent health surface).
 *
 * Starts the shell, serves the worker's own content-free health endpoint on
 * WORKER_HEALTH_HOST/WORKER_HEALTH_PORT (127.0.0.1:3100 by default), and
 * shuts down cleanly on the usual process signals. No provider credentials
 * are read or required.
 */
import { createWorkerHealthServer } from "./health.js";
import { createWorkerShell } from "./index.js";

const env = process.env;

/** Compose-compatible resolution: an empty value behaves like an unset one. */
const pick = (key: string, fallback: string): string => {
  const value = env[key];
  return value !== undefined && value !== "" ? value : fallback;
};

const shell = createWorkerShell({ env });
await shell.start();
const health = await createWorkerHealthServer({
  host: pick("WORKER_HEALTH_HOST", "127.0.0.1"),
  port: Number(pick("WORKER_HEALTH_PORT", "3100")),
  getStatus: () => (shell.running ? "ok" : "unavailable"),
});
process.stdout.write(`@misyra/worker shell started; health at ${health.address}\n`);

const stop = async (): Promise<void> => {
  await health.close();
  await shell.stop();
  process.stdout.write("@misyra/worker shell stopped\n");
  process.exit(0);
};

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
