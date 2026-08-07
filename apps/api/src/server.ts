/**
 * Long-running entry point for the Misyra API shell (MTS-003).
 *
 * Binds PORT/HOST (with local defaults) and shuts down cleanly on the usual
 * process signals. No provider credentials are read or required.
 */
import { buildApp } from "./index.js";

const env = process.env;
const port = Number(env.PORT ?? "3000");
const host = env.HOST ?? "127.0.0.1";

const app = await buildApp({ env });
const address = await app.listen({ port, host });
process.stdout.write(`@misyra/api shell listening at ${address}\n`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => {
      process.exit(0);
    });
  });
}
