import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkerHealthServer } from './index.js';

async function listen(server: ReturnType<typeof createWorkerHealthServer>) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('worker health server did not expose an address');
  }

  return `http://127.0.0.1:${address.port}`;
}

describe('worker health observability', () => {
  const servers: Array<ReturnType<typeof createWorkerHealthServer>> = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) reject(error);
              else resolve();
            });
          }),
      ),
    );
  });

  it('exposes liveness independently from readiness dependencies', async () => {
    const readiness = vi.fn(() => Promise.resolve(false));
    const server = createWorkerHealthServer({ readiness });
    servers.push(server);
    const origin = await listen(server);

    const response = await fetch(`${origin}/health/live`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"status":"ok"}');
    expect(readiness).not.toHaveBeenCalled();
  });

  it('exposes stable worker readiness status codes', async () => {
    const server = createWorkerHealthServer({ readiness: () => Promise.resolve(false) });
    servers.push(server);
    const origin = await listen(server);

    const response = await fetch(`${origin}/health/ready`);

    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"status":"not_ready"}');
  });

  it('never includes process environment values in health responses', async () => {
    vi.stubEnv('WORKER_SECRET', 'worker-super-secret');
    const server = createWorkerHealthServer({ readiness: () => Promise.resolve(true) });
    servers.push(server);
    const origin = await listen(server);

    const live = await fetch(`${origin}/health/live`);
    const ready = await fetch(`${origin}/health/ready`);
    const payload = { live: await live.text(), ready: await ready.text() };

    expect(payload).toMatchInlineSnapshot(`
      {
        "live": "{\"status\":\"ok\"}",
        "ready": "{\"status\":\"ready\"}",
      }
    `);
    expect(JSON.stringify(payload)).not.toContain('worker-super-secret');
  });
});
