import { describe, expect, it, vi } from 'vitest';

import {
  createGoogleCalendarRoutes,
  type GoogleCalendarRouteService,
} from './google-calendar-routes.js';
import { GoogleCalendarOAuthError } from './google-calendar-connection.js';
import { createApiServer } from './index.js';

const accountId = '00000000-0000-4000-8000-000000000069';
const connectionId = '00000000-0000-4000-8000-000000000169';

function createService() {
  const startOAuth = vi.fn(
    (
      requestedAccountId: string,
      input: {
        initialSyncDirection: 'external_to_misyra' | 'misyra_to_external';
        selectedCalendarId?: string;
      },
    ) => {
      void requestedAccountId;
      void input;
      return Promise.resolve({ authorizationUrl: 'https://accounts.google.test/oauth' });
    },
  );
  const completeOAuth = vi.fn((input: { state: string; code: string }) => {
    void input;
    return Promise.resolve({
      id: connectionId,
      accountId,
      provider: 'google' as const,
      providerCalendarId: 'primary',
      initialSyncDirection: 'external_to_misyra' as const,
      encryptedRefreshToken: 'ciphertext-must-not-leak',
      state: 'connected' as const,
    });
  });
  const disconnect = vi.fn((requestedAccountId: string, requestedConnectionId: string) => {
    void requestedAccountId;
    void requestedConnectionId;
    return Promise.resolve();
  });
  const service: GoogleCalendarRouteService = { startOAuth, completeOAuth, disconnect };
  return { completeOAuth, disconnect, service, startOAuth };
}

describe('MTS-069 Google calendar API routes', () => {
  it('mounts authenticated Google connect and forwards the selected calendar intent', async () => {
    const { service, startOAuth } = createService();
    const server = createApiServer({
      routes: createGoogleCalendarRoutes(service),
      authenticate: () => ({ accountId }),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/calendars/google/connect',
      payload: {
        initialSyncDirection: 'external_to_misyra',
        selectedCalendarId: 'primary',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      payload: { authorizationUrl: 'https://accounts.google.test/oauth' },
    });
    expect(startOAuth).toHaveBeenCalledWith(accountId, {
      initialSyncDirection: 'external_to_misyra',
      selectedCalendarId: 'primary',
    });
    await server.close();
  });

  it('allows dedicated-calendar OAuth without accepting a client-selected calendar id', async () => {
    const { service, startOAuth } = createService();
    const server = createApiServer({
      routes: createGoogleCalendarRoutes(service),
      authenticate: () => ({ accountId }),
    });

    const valid = await server.inject({
      method: 'POST',
      url: '/v1/calendars/google/connect',
      payload: { initialSyncDirection: 'misyra_to_external' },
    });
    const invalid = await server.inject({
      method: 'POST',
      url: '/v1/calendars/google/connect',
      payload: {
        initialSyncDirection: 'misyra_to_external',
        selectedCalendarId: 'client-must-not-choose-for-dedicated-mode',
      },
    });

    expect(valid.statusCode).toBe(200);
    expect(invalid.statusCode).toBe(400);
    expect(startOAuth).toHaveBeenCalledTimes(1);
    expect(startOAuth).toHaveBeenCalledWith(accountId, {
      initialSyncDirection: 'misyra_to_external',
    });
    await server.close();
  });

  it('exposes the OAuth callback publicly while returning no token or account identifier', async () => {
    const { completeOAuth, service } = createService();
    const authenticate = vi.fn(() => null);
    const server = createApiServer({
      routes: createGoogleCalendarRoutes(service),
      authenticate,
    });

    const response = await server.inject({
      method: 'GET',
      url: '/v1/calendars/google/callback?state=opaque-state&code=provider-code',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      payload: {
        id: connectionId,
        provider: 'google',
        providerCalendarId: 'primary',
        initialSyncDirection: 'external_to_misyra',
        state: 'connected',
      },
    });
    expect(JSON.stringify(response.json())).not.toContain('ciphertext-must-not-leak');
    expect(JSON.stringify(response.json())).not.toContain(accountId);
    expect(completeOAuth).toHaveBeenCalledWith({ state: 'opaque-state', code: 'provider-code' });
    expect(authenticate).not.toHaveBeenCalled();
    await server.close();
  });

  it('disconnects only the authenticated account connection', async () => {
    const { disconnect, service } = createService();
    const server = createApiServer({
      routes: createGoogleCalendarRoutes(service),
      authenticate: () => ({ accountId }),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/calendars/disconnect',
      payload: { connectionId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, payload: { disconnected: true } });
    expect(disconnect).toHaveBeenCalledWith(accountId, connectionId);
    await server.close();
  });

  it.each([
    ['invalid_state', 400, 'validation_failed'],
    ['connection_exists', 409, 'conflict'],
    ['not_found', 404, 'not_found'],
    ['provider_error', 503, 'temporarily_unavailable'],
  ] as const)('maps %s without exposing provider details', async (code, statusCode, apiCode) => {
    const harness = createService();
    if (code === 'invalid_state' || code === 'provider_error') {
      harness.completeOAuth.mockRejectedValueOnce(new GoogleCalendarOAuthError(code));
    } else if (code === 'connection_exists') {
      harness.startOAuth.mockRejectedValueOnce(new GoogleCalendarOAuthError(code));
    } else {
      harness.disconnect.mockRejectedValueOnce(new GoogleCalendarOAuthError(code));
    }
    const server = createApiServer({
      routes: createGoogleCalendarRoutes(harness.service),
      authenticate: () => ({ accountId }),
    });

    const response =
      code === 'connection_exists'
        ? await server.inject({
            method: 'POST',
            url: '/v1/calendars/google/connect',
            payload: { initialSyncDirection: 'external_to_misyra', selectedCalendarId: 'primary' },
          })
        : code === 'not_found'
          ? await server.inject({
              method: 'POST',
              url: '/v1/calendars/disconnect',
              payload: { connectionId },
            })
          : await server.inject({
              method: 'GET',
              url: '/v1/calendars/google/callback?state=opaque-state&code=provider-code',
            });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toMatchObject({ ok: false, error: { code: apiCode } });
    expect(JSON.stringify(response.json())).not.toContain('provider_error');
    await server.close();
  });
});
