import { createServer, type ServerResponse } from 'node:http';
import { connect } from 'node:net';
import { pathToFileURL } from 'node:url';

export type ReadinessCheck = () => boolean | Promise<boolean>;

type WorkerHealthOptions = {
  readiness?: ReadinessCheck;
};

type WorkerStartOptions = WorkerHealthOptions & {
  host?: string;
  port?: number;
};

function resolvePort(value: string | undefined, fallback: number) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : fallback;
}

function probeTcp(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    let settled = false;

    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ready);
    };

    socket.once('connect', () => {
      finish(true);
    });
    socket.once('error', () => {
      finish(false);
    });
    socket.setTimeout(1_000, () => {
      finish(false);
    });
  });
}

export function createLocalReadinessCheck(env: NodeJS.ProcessEnv = process.env): ReadinessCheck {
  const postgresPort = resolvePort(env.POSTGRES_PORT, 5432);
  const azuriteBlobPort = resolvePort(env.AZURITE_BLOB_PORT, 10000);

  return async () => {
    const [postgresReady, azuriteReady] = await Promise.all([
      probeTcp(postgresPort),
      probeTcp(azuriteBlobPort),
    ]);

    return postgresReady && azuriteReady;
  };
}

function sendJson(response: ServerResponse, statusCode: number, payload: object) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

export function createWorkerHealthServer(options: WorkerHealthOptions = {}) {
  const readiness = options.readiness ?? createLocalReadinessCheck();

  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health/live') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (request.method === 'GET' && request.url === '/health/ready') {
      let ready: boolean;

      try {
        ready = await readiness();
      } catch {
        ready = false;
      }

      sendJson(response, ready ? 200 : 503, { status: ready ? 'ready' : 'not_ready' });
      return;
    }

    sendJson(response, 404, { status: 'not_found' });
  });
}

export function startWorker(options: WorkerStartOptions = {}) {
  const healthServer = createWorkerHealthServer({ readiness: options.readiness });
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? resolvePort(process.env.WORKER_HEALTH_PORT, 3001);

  healthServer.listen({ host, port });

  return { status: 'started', healthServer } as const;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWorker();
}
