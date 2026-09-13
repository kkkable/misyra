import { describe, expect, it, vi } from 'vitest';

import {
  createGoogleCalendarRoutes,
  type GoogleCalendarRouteService,
  type GoogleCalendarRouteSyncService,
  type GoogleCalendarRouteWatchService,
} from './google-calendar-routes.js';
import { createApiServer } from './index.js';

const accountId = '00000000-0000-4000-8000-000000000071';
const connectionId = '00000000-0000-4000-8000-000000000171';

function connectionService(): GoogleCalendarRouteService {
  return {
    startOAuth: vi.fn().mockResolvedValue({ authorizationUrl: 'https://accounts.google.test/oauth' }),
    completeOAuth: vi.fn().mockResolvedValue({
      id: connectionId,
      accountId,
      provider: 'google',
      providerCalendarId: 'primary',
      initialSyncDirection: 'external_to_misyra',
      encryptedRefreshToken: 'fixture-ciphertext',
      state: 'connected',
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

describe('MTS-071 Google watch API routes', () => {
  it('treats webhook payload as opaque and authenticates from Google channel headers', async () => {
    const handleWebhook = vi.fn().mockResolvedValue({ accepted: true, scheduled: true });
    const watchService: GoogleCalendarRouteWatchService = {
      handleWebhook,
      ensureChannel: vi.fn().mockResolvedValue(undefined),
    };
    const authenticate = vi.fn(() => null);
    const server = createApiServer({
      routes: createGoogleCalendarRoutes(connectionService(), undefined, watchService),
      authenticate,
    });
    const body = { fabricated: { event: 'must-not-be-trusted' } };

    const response = await server.inject({
      method: 'POST',
      url: '/v1/webhooks/google-calendar',
      headers: {
        'x-goog-channel-id': 'channel-1',
        'x-goog-resource-id': 'resource-1',
        'x-goog-channel-token': 'fixture-channel-value',
        'x-goog-message-number': '42',
        'x-goog-resource-state': 'exists',
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      payload: { accepted: true, scheduled: true },
    });
    expect(handleWebhook).toHaveBeenCalledWith({
      channelId: 'channel-1',
      resourceId: 'resource-1',
      channelToken: 'fixture-channel-value',
      messageNumber: '42',
      resourceState: 'exists',
      body,
    });
    expect(authenticate).not.toHaveBeenCalled();
    await server.close();
  });

  it('creates the watch channel only after initial synchronization completes', async () => {
    const order: string[] = [];
    const syncService: GoogleCalendarRouteSyncService = {
      initialSync: vi.fn(() => {
        order.push('sync');
        return Promise.resolve();
      }),
    };
    const watchService: GoogleCalendarRouteWatchService = {
      handleWebhook: vi.fn().mockResolvedValue({ accepted: true, scheduled: true }),
      ensureChannel: vi.fn(() => {
        order.push('watch');
        return Promise.resolve();
      }),
    };
    const server = createApiServer({
      routes: createGoogleCalendarRoutes(connectionService(), syncService, watchService),
      authenticate: () => ({ accountId }),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/v1/calendars/google/callback?state=opaque-state&code=provider-code',
    });

    expect(response.statusCode).toBe(200);
    expect(order).toEqual(['sync', 'watch']);
    expect(watchService.ensureChannel).toHaveBeenCalledWith(connectionId);
    await server.close();
  });
});
