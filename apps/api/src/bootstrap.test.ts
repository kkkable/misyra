import { apiResponseEnvelopeSchema, clientActionErrorCodes } from '@misyra/contracts';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, apiErrorCodes, createApiServer } from './index.js';

describe('MTS-027 API bootstrap', () => {
  it('uses the shared MTS-023 API response and client-action error contracts', async () => {
    expect(apiErrorCodes).toBe(clientActionErrorCodes);

    const server = createApiServer({
      routes: [
        {
          method: 'GET',
          path: '/missions/:missionId',
          handler: () => ({ missionId: 'mission-1' }),
        },
      ],
      authenticate: () => ({ accountId: 'account-1' }),
    });

    const response = await server.inject({ method: 'GET', url: '/v1/missions/mission-1' });

    expect(() => apiResponseEnvelopeSchema.parse(response.json())).not.toThrow();
    await server.close();
  });

  it('registers application routes only below /v1 and wraps success in the v1 envelope', async () => {
    const server = createApiServer({
      routes: [
        {
          method: 'GET',
          path: '/missions/:missionId',
          handler: () => ({ missionId: 'mission-1' }),
        },
      ],
      authenticate: () => ({ accountId: 'account-1' }),
    });
    const requestId = '123e4567-e89b-42d3-a456-426614174000';

    const versioned = await server.inject({
      method: 'GET',
      url: '/v1/missions/mission-1',
      headers: { 'x-request-id': requestId },
    });
    const unversioned = await server.inject({ method: 'GET', url: '/missions/mission-1' });

    expect(versioned.statusCode).toBe(200);
    expect(versioned.json()).toMatchObject({
      version: 1,
      requestId,
      ok: true,
      payload: { missionId: 'mission-1' },
    });
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
          handler: () => ({ created: true }),
        },
      ],
      authenticate: () => ({ accountId: 'account-1' }),
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

  it('authenticates protected routes before schema validation', async () => {
    const authenticate = vi.fn(() => null);
    const handler = vi.fn(() => ({ created: true }));
    const server = createApiServer({
      routes: [
        {
          method: 'POST',
          path: '/missions',
          schema: {
            body: {
              type: 'object',
              required: ['title'],
              properties: { title: { type: 'string', minLength: 1 } },
            },
          },
          handler,
        },
      ],
      authenticate,
    });

    const response = await server.inject({ method: 'POST', url: '/v1/missions', payload: {} });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'unauthorized' } });
    expect(authenticate).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
    await server.close();
  });

  it('maps domain failures to stable client-action codes without internal details', async () => {
    const server = createApiServer({
      routes: [
        {
          method: 'POST',
          path: '/missions/:missionId/complete',
          handler: () => {
            throw new ApiError('already_completed');
          },
        },
      ],
      authenticate: () => ({ accountId: 'account-1' }),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/missions/mission-1/complete',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: 'already_completed',
        retryable: false,
        messageKey: 'error.already_completed',
      },
    });
    expect(response.body).not.toContain('stack');
    await server.close();
  });

  it('maps unexpected server failures to a retryable content-free envelope', async () => {
    const server = createApiServer({
      routes: [
        {
          method: 'GET',
          path: '/missions',
          handler: () => {
            throw new Error('private database failure detail');
          },
        },
      ],
      authenticate: () => ({ accountId: 'account-1' }),
    });

    const response = await server.inject({ method: 'GET', url: '/v1/missions' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: 'temporarily_unavailable',
        retryable: true,
        messageKey: 'error.temporarily_unavailable',
      },
    });
    expect(response.body).not.toContain('private database failure detail');
    await server.close();
  });

  it('authenticates before a protected route can disclose resource existence', async () => {
    const handler = vi.fn(() => ({ secret: 'resource-exists' }));
    const server = createApiServer({
      routes: [{ method: 'GET', path: '/missions/:missionId', handler }],
      authenticate: () => null,
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
          handler: () => ({ accepted: true }),
        },
      ],
      authenticate: () => ({ accountId: 'account-1' }),
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
