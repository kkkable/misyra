import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApiServer } from './index.js';

describe('API health and readiness routes', () => {
  const servers: Array<ReturnType<typeof createApiServer>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('keeps liveness independent from dependency checks', async () => {
    const readiness = vi.fn(() => Promise.resolve(false));
    const server = createApiServer({ readiness });
    servers.push(server);

    const response = await server.inject({ method: 'GET', url: '/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"status":"ok"}');
    expect(readiness).not.toHaveBeenCalled();
  });

  it('returns stable readiness status codes when dependencies are up or down', async () => {
    const readyServer = createApiServer({ readiness: () => Promise.resolve(true) });
    const downServer = createApiServer({ readiness: () => Promise.resolve(false) });
    servers.push(readyServer, downServer);

    const ready = await readyServer.inject({ method: 'GET', url: '/health/ready' });
    const down = await downServer.inject({ method: 'GET', url: '/health/ready' });

    expect(ready.statusCode).toBe(200);
    expect(ready.body).toBe('{"status":"ready"}');
    expect(down.statusCode).toBe(503);
    expect(down.body).toBe('{"status":"not_ready"}');
  });

  it('returns content-free responses without environment values', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://secret-user:secret-password@example.test/db');
    vi.stubEnv('AZURE_STORAGE_CONNECTION_STRING', 'AccountKey=super-secret-key');
    const server = createApiServer({ readiness: () => Promise.resolve(false) });
    servers.push(server);

    const live = await server.inject({ method: 'GET', url: '/health/live' });
    const ready = await server.inject({ method: 'GET', url: '/health/ready' });

    expect({ live: live.body, ready: ready.body }).toMatchInlineSnapshot(`
      {
        "live": "{\"status\":\"ok\"}",
        "ready": "{\"status\":\"not_ready\"}",
      }
    `);
    expect(`${live.body}${ready.body}`).not.toContain('secret');
  });
});
