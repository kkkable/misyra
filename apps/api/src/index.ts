import { pathToFileURL } from 'node:url';

import Fastify from 'fastify';

export function createApiServer() {
  return Fastify({ logger: false });
}

export async function startApiServer() {
  const server = createApiServer();
  await server.listen({ host: '127.0.0.1', port: 3000 });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startApiServer();
}
