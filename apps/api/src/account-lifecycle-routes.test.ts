import { describe, expect, it, vi } from 'vitest';

import {
  createAccountLifecycleRoutes,
  type AccountLifecycleRouteService,
} from './account-lifecycle-routes.js';
import { createApiServer } from './index.js';

const accountId = '123e4567-e89b-42d3-a456-426614174000';

function service() {
  const reauthenticate = vi.fn(async () => ({
    reauthenticationProof: 'reauth-proof',
    expiresAt: '2026-09-05T14:05:00.000Z',
  }));
  const deleteAccount = vi.fn(async () => ({ deleted: true as const }));
  const lifecycleService: AccountLifecycleRouteService = { reauthenticate, deleteAccount };
  return { lifecycleService, reauthenticate, deleteAccount };
}

describe('MTS-037 account lifecycle routes', () => {
  it('reauthenticates the authenticated account through the protected v1 route', async () => {
    const { lifecycleService, reauthenticate } = service();
    const authenticate = vi.fn(() => ({ accountId }));
    const server = createApiServer({
      routes: createAccountLifecycleRoutes(lifecycleService),
      authenticate,
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/reauthenticate',
      payload: { provider: 'google', proof: 'provider-proof', nonce: 'nonce-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      payload: {
        reauthenticationProof: 'reauth-proof',
        expiresAt: '2026-09-05T14:05:00.000Z',
      },
    });
    expect(reauthenticate).toHaveBeenCalledWith(accountId, {
      provider: 'google',
      proof: 'provider-proof',
      nonce: 'nonce-1',
    });
    await server.close();
  });

  it('deletes only the authenticated account through the protected v1 route', async () => {
    const { lifecycleService, deleteAccount } = service();
    const authenticate = vi.fn(() => ({ accountId }));
    const server = createApiServer({
      routes: createAccountLifecycleRoutes(lifecycleService),
      authenticate,
    });

    const response = await server.inject({
      method: 'DELETE',
      url: '/v1/account',
      payload: { reauthenticationProof: 'reauth-proof' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, payload: { deleted: true } });
    expect(deleteAccount).toHaveBeenCalledWith(accountId, 'reauth-proof');
    await server.close();
  });

  it('requires access-token authentication before either lifecycle service runs', async () => {
    const { lifecycleService, reauthenticate, deleteAccount } = service();
    const server = createApiServer({
      routes: createAccountLifecycleRoutes(lifecycleService),
      authenticate: () => null,
    });

    const reauthResponse = await server.inject({
      method: 'POST',
      url: '/v1/auth/reauthenticate',
      payload: { provider: 'google', proof: 'provider-proof', nonce: 'nonce-1' },
    });
    const deleteResponse = await server.inject({
      method: 'DELETE',
      url: '/v1/account',
      payload: { reauthenticationProof: 'reauth-proof' },
    });

    expect(reauthResponse.statusCode).toBe(401);
    expect(deleteResponse.statusCode).toBe(401);
    expect(reauthenticate).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
    await server.close();
  });

  it('rejects malformed or extra lifecycle request fields before service invocation', async () => {
    const { lifecycleService, reauthenticate, deleteAccount } = service();
    const server = createApiServer({
      routes: createAccountLifecycleRoutes(lifecycleService),
      authenticate: () => ({ accountId }),
    });

    const reauthResponse = await server.inject({
      method: 'POST',
      url: '/v1/auth/reauthenticate',
      payload: { provider: 'google', proof: '', nonce: '', accountId },
    });
    const deleteResponse = await server.inject({
      method: 'DELETE',
      url: '/v1/account',
      payload: { reauthenticationProof: '', accountId },
    });

    expect(reauthResponse.statusCode).toBe(400);
    expect(deleteResponse.statusCode).toBe(400);
    expect(reauthenticate).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
    await server.close();
  });
});
