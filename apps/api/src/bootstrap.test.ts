import { describe, expect, it, vi } from 'vitest';

import { createApiServer } from './index.js';

describe('MTS-027 API bootstrap', () => {
  it('registers application routes only below /v1', async () => {
    const server = createApiServer({
      routes: [
        {
          method: 'GET',
          path: '/missions/:missionId',
          handler: async () => ({ missionId: 'mission-1' }),
        },
      ],
      authenticate: async () => ({ accountId: 'account-1' }),
    });

    const versioned = await server.inject({ method: 'GET', url: '/v1/missions/mission-1' });
    const unversioned = await server.inject({ method: 'GET', url: '/missions/mission-1' });

    expect(versioned.statusCode).toBe(200);
    expect(unversioned.statusCode).toBe(404);
    await server.close();
  });

  it('maps request validation failures to the stable v1 error envelope', async () => {
    const server = createApiServer({
      routes: [
        {
          method: 'POST',
          path: '/missions',
          schema: {
            body: {
              type: 'object',
              required: ['title'],
              additionalProperties: false,
              properties: { title: { type: 'string', minLength: 1 } },
            },
          },
          handler: async () => ({ created: true }),
        },
      ],
      authenticate: async () => ({ accountId: 'account-1' }),
    });

    const response = await server.inject({ method: 'POST', url: '/v1/missions', payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      version: 1,
      ok: false,
      error: {
        code: 'validation_failed',
        retryable: false,
        messageKey: 'error.validation_failed',
      },
    });
    expect(response.json()).not.toHaveProperty('stack');
    expect(response.json()).not.toHaveProperty('validation');
    await server.close();
  });

  it('authenticates before a protected route can disclose resource existence', async () => {
    const handler = vi.fn(async () => ({ secret: 'resource-exists' }));
    const server = createApiServer({
      routes: [{ method: 'GET', path: '/missions/:missionId', handler }],
      authenticate: async () => null,
    });

    const response = await server.inject({ method: 'GET', url: '/v1/missions/nonexistent' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'unauthorized' } });
    expect(handler).not.toHaveBeenCalled();
    await server.close();
  });

  it('logs correlation metadata without content-bearing request data', async () => {
    const log = vi.fn();
    const server = createApiServer({
      routes: [
        {
          method: 'POST',
          path: '/feedback',
          handler: async () => ({ accepted: true }),
        },
      ],
      authenticate: async () => ({ accountId: 'account-1' }),
      auditLog: log,
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/feedback?debug=secret-query',
      headers: {
        authorization: 'Bearer secret-token',
        'x-request-id': '123e4567-e89b-42d3-a456-426614174000',
      },
      payload: { message: 'private feedback body' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(log).toHaveBeenCalled();
    const serialized = JSON.stringify(log.mock.calls);
    expect(serialized).toContain('123e4567-e89b-42d3-a456-426614174000');
    expect(serialized).not.toContain('private feedback body');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('secret-query');
    await server.close();
  });
});
