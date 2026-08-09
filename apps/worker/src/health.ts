/**
 * Independently observable worker health (MTS-005).
 *
 * The worker process serves its own content-free health endpoint over a
 * minimal node:http listener so worker health is never an alias of the API
 * health endpoint. Only `GET /health/live` is served: `200 {"status":"ok"}`
 * while the worker is running, `503 {"status":"unavailable"}` otherwise.
 */
import { createServer, type Server } from "node:http";

/** Lifecycle of the worker health listener. */
export interface WorkerHealthServer {
  /** Bound base URL, e.g. http://127.0.0.1:3100. */
  readonly address: string;
  /** Stop accepting connections and release the port. */
  close(): Promise<void>;
}

/** Options accepted by {@link createWorkerHealthServer}. */
export interface WorkerHealthServerOptions {
  /** Bind host; defaults to 127.0.0.1 so no network interface is exposed. */
  host?: string | undefined;
  /** Bind port; defaults to 3100. Pass 0 for an ephemeral port. */
  port?: number | undefined;
  /** Current worker status; defaults to "ok". */
  getStatus?: (() => "ok" | "unavailable") | undefined;
}

/**
 * Create the worker health listener without starting the worker.
 *
 * @param options bind and status options
 */
export async function createWorkerHealthServer(
  options: WorkerHealthServerOptions = {},
): Promise<WorkerHealthServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3100;
  const getStatus = options.getStatus ?? (() => "ok" as const);

  const server: Server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health/live") {
      const status = getStatus();
      response.writeHead(status === "ok" ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status }));
      return;
    }
    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const bound = server.address();
  const boundPort = typeof bound === "object" && bound !== null ? bound.port : port;
  const address = `http://${host}:${boundPort}`;

  return {
    get address() {
      return address;
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
