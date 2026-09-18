import { apiResponseEnvelopeSchema } from '@misyra/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  CalendarConnectionError,
  createCalendarConnectionRoutes,
  type CalendarConnectionRouteService,
} from './calendar-connection-routes.js';
import { createApiServer } from './index.js';

const accountId = '00000000-0000-4000-8000-000000000078';
const connectionId = '00000000-0000-4000-8000-000000000178';

function service(provider: 'apple' | 'google' = 'apple') {
  const getStatus = vi.fn(() =>
    Promise.resolve({
      id: connectionId,
      provider,
      providerCalendarId: `${provider}-calendar-1`,
      initialSyncDirection: 'external_to_misyra' as const,
      state: 'connected' as const,
    }),
  );
  const disconnect = vi.fn(() => Promise.resolve());
  const routeService: CalendarConnectionRouteService = { disconnect, getStatus };
  return { disconnect, getStatus, routeService };
}

describe('provider-neutral calendar connection routes', () => {
  it('returns an Apple connection through the existing generic status endpoint', async () => {
    const harness = service('apple');
    const server = createApiServer({
      routes: createCalendarConnectionRoutes(harness.routeService),
      authenticate: () => ({ accountId }),
    });

    const response = await server.inject({ method: 'GET', url: '/v1/calendars/connection' });

    expect(response.statusCode).toBe(200);
    expect(() => apiResponseEnvelopeSchema.parse(response.json())).not.toThrow();
    expect(response.json()).toMatchObject({
      version: 1,
      ok: true,
      payload: {
        connection: {
          id: connectionId,
          provider: 'apple',
          providerCalendarId: 'apple-calendar-1',
          initialSyncDirection: 'external_to_misyra',
          state: 'connected',
        },
      },
    });
    expect(harness.getStatus).toHaveBeenCalledWith(accountId);
    await server.close();
  });

  it('disconnects either provider through the existing generic disconnect endpoint', async () => {
    const harness = service('google');
    const server = createApiServer({
      routes: createCalendarConnectionRoutes(harness.routeService),
      authenticate: () => ({ accountId }),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/calendars/disconnect',
      payload: { connectionId },
    });

    expect(response.statusCode).toBe(200);
    expect(() => apiResponseEnvelopeSchema.parse(response.json())).not.toThrow();
    expect(response.json()).toMatchObject({
      version: 1,
      ok: true,
      payload: { disconnected: true },
    });
    expect(harness.disconnect).toHaveBeenCalledWith(accountId, connectionId);
    await server.close();
  });

  it('maps a provider-neutral missing connection to the stable not-found error', async () => {
    const harness = service();
    harness.disconnect.mockRejectedValueOnce(new CalendarConnectionError('not_found'));
    const server = createApiServer({
      routes: createCalendarConnectionRoutes(harness.routeService),
      authenticate: () => ({ accountId }),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/calendars/disconnect',
      payload: { connectionId },
    });

    expect(response.statusCode).toBe(404);
    expect(() => apiResponseEnvelopeSchema.parse(response.json())).not.toThrow();
    expect(response.json()).toMatchObject({
      version: 1,
      ok: false,
      error: { code: 'not_found' },
    });
    await server.close();
  });
});
