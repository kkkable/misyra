/**
 * Long-running entry point for the Misyra worker shell (MTS-003).
 *
 * Starts the shell and stops it cleanly on the usual process signals. No
 * provider credentials are read or required.
 */
import { createWorkerShell } from "./index.js";

const shell = createWorkerShell({ env: process.env });
await shell.start();
process.stdout.write("@misyra/worker shell started\n");

const stop = async (): Promise<void> => {
  await shell.stop();
  process.stdout.write("@misyra/worker shell stopped\n");
  process.exit(0);
};

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
