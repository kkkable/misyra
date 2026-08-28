import { connect } from 'node:net';
import { pathToFileURL } from 'node:url';

import Fastify from 'fastify';

export type ReadinessCheck = () => boolean | Promise<boolean>;

type ApiServerOptions = {
  readiness?: ReadinessCheck;
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

export function createApiServer(options: ApiServerOptions = {}) {
  const readiness = options.readiness ?? createLocalReadinessCheck();
  const server = Fastify({ logger: false });

  server.get('/health/live', () => ({ status: 'ok' as const }));
  server.get('/health/ready', async (_request, reply) => {
    try {
      if (!(await readiness())) {
        return reply.code(503).send({ status: 'not_ready' as const });
      }
    } catch {
      return reply.code(503).send({ status: 'not_ready' as const });
    }

    return { status: 'ready' as const };
  });

  return server;
}

export async function startApiServer() {
  const server = createApiServer();
  await server.listen({ host: '127.0.0.1', port: 3000 });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startApiServer();
}
