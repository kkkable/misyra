import { describe, expect, it, vi } from 'vitest';

import { createAuthRoutes, type AuthRouteService } from './auth-routes.js';
import { AuthSecurityError } from './auth.js';
import { createApiServer } from './index.js';

const tokens = {
  accountId: '123e4567-e89b-42d3-a456-426614174000',
  accessToken: 'access-token',
  accessTokenExpiresAt: '2026-09-05T03:20:00.000Z',
  refreshToken: 'refresh-token',
  refreshTokenExpiresAt: '2026-10-05T03:05:00.000Z',
};

function service() {
  const exchange = vi.fn(() => Promise.resolve(tokens));
  const refresh = vi.fn(() => Promise.resolve(tokens));
  const authService: AuthRouteService = { exchange, refresh };
  return { authService, exchange, refresh };
}

describe('MTS-034 auth routes', () => {
  it.each(['apple', 'google'] as const)(
    'exposes public %s provider exchange below /v1',
    async (provider) => {
      const { authService, exchange } = service();
      const authenticate = vi.fn(() => null);
      const server = createApiServer({
        routes: createAuthRoutes(authService),
        authenticate,
      });

      const response = await server.inject({
        method: 'POST',
        url: `/v1/auth/${provider}/exchange`,
        payload: { proof: 'provider-proof', nonce: 'nonce-1' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ok: true, payload: tokens });
      expect(exchange).toHaveBeenCalledWith({
        provider,
        proof: 'provider-proof',
        nonce: 'nonce-1',
      });
      expect(authenticate).not.toHaveBeenCalled();
      await server.close();
    },
  );

  it('exposes refresh without requiring a still-valid access token', async () => {
    const { authService, refresh } = service();
    const authenticate = vi.fn(() => null);
    const server = createApiServer({
      routes: createAuthRoutes(authService),
      authenticate,
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: 'refresh-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(refresh).toHaveBeenCalledWith('refresh-token');
    expect(authenticate).not.toHaveBeenCalled();
    await server.close();
  });

  it('rejects malformed exchange and refresh bodies before invoking auth services', async () => {
    const { authService, exchange: exchangeSpy, refresh: refreshSpy } = service();
    const server = createApiServer({ routes: createAuthRoutes(authService) });

    const exchange = await server.inject({
      method: 'POST',
      url: '/v1/auth/google/exchange',
      payload: { proof: '', nonce: '' },
    });
    const refresh = await server.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: '' },
    });

    expect(exchange.statusCode).toBe(400);
    expect(refresh.statusCode).toBe(400);
    expect(exchangeSpy).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
    await server.close();
  });

  it('maps proof and refresh security failures to the same unauthorized envelope', async () => {
    const exchangeSpy = vi.fn(() =>
      Promise.reject(new AuthSecurityError('invalid_provider_proof')),
    );
    const refreshSpy = vi.fn(() => Promise.reject(new AuthSecurityError('refresh_token_reuse')));
    const authService: AuthRouteService = { exchange: exchangeSpy, refresh: refreshSpy };
    const server = createApiServer({ routes: createAuthRoutes(authService) });

    const exchange = await server.inject({
      method: 'POST',
      url: '/v1/auth/apple/exchange',
      payload: { proof: 'invalid-proof', nonce: 'nonce-1' },
    });
    const refresh = await server.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: 'reused-token' },
    });

    expect(exchange.statusCode).toBe(401);
    expect(refresh.statusCode).toBe(401);
    expect(exchange.json()).toMatchObject({ ok: false, error: { code: 'unauthorized' } });
    expect(refresh.json()).toMatchObject({ ok: false, error: { code: 'unauthorized' } });
    await server.close();
  });
});
