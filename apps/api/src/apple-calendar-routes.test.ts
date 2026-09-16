import { describe, expect, it, vi } from 'vitest';

import {
  AppleCalendarConnectionError,
  createAppleCalendarRoutes,
  type AppleCalendarRouteService,
} from './apple-calendar-routes.js';
import { createApiServer } from './index.js';

const accountId = '00000000-0000-4000-8000-000000000077';
const connectionId = '00000000-0000-4000-8000-000000000177';

function createService() {
  const connect = vi.fn(
    (
      requestedAccountId: string,
      input: {
        providerCalendarId: string;
        initialSyncDirection: 'external_to_misyra' | 'misyra_to_external';
      },
    ) => {
      void requestedAccountId;
      return Promise.resolve({
        id: connectionId,
        accountId,
        provider: 'apple' as const,
        providerCalendarId: input.providerCalendarId,
        initialSyncDirection: input.initialSyncDirection,
        state: 'connected' as const,
      });
    },
  );
  const service: AppleCalendarRouteService = { connect };
  return { connect, service };
}

describe('MTS-077 Apple calendar metadata API route', () => {
  it('stores only the authenticated device-selected EventKit calendar metadata', async () => {
    const { connect, service } = createService();
    const server = createApiServer({
      routes: createAppleCalendarRoutes(service),
      authenticate: () => ({ accountId }),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/calendars/apple/connect',
      payload: {
        provider: 'apple',
        providerCalendarId: 'eventkit-calendar-1',
        initialSyncDirection: 'external_to_misyra',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      payload: {
        id: connectionId,
        provider: 'apple',
        providerCalendarId: 'eventkit-calendar-1',
        initialSyncDirection: 'external_to_misyra',
        state: 'connected',
      },
    });
    expect(connect).toHaveBeenCalledWith(accountId, {
      providerCalendarId: 'eventkit-calendar-1',
      initialSyncDirection: 'external_to_misyra',
    });
    expect(JSON.stringify(response.json())).not.toContain(accountId);
    await server.close();
  });

  it('rejects non-Apple bodies and maps the single-connection conflict without provider details', async () => {
    const { connect, service } = createService();
    const server = createApiServer({
      routes: createAppleCalendarRoutes(service),
      authenticate: () => ({ accountId }),
    });

    const wrongProvider = await server.inject({
      method: 'POST',
      url: '/v1/calendars/apple/connect',
      payload: {
        provider: 'google',
        providerCalendarId: 'not-eventkit',
        initialSyncDirection: 'external_to_misyra',
      },
    });
    expect(wrongProvider.statusCode).toBe(400);
    expect(connect).not.toHaveBeenCalled();

    connect.mockRejectedValueOnce(new AppleCalendarConnectionError('connection_exists'));
    const conflict = await server.inject({
      method: 'POST',
      url: '/v1/calendars/apple/connect',
      payload: {
        provider: 'apple',
        providerCalendarId: 'eventkit-calendar-2',
        initialSyncDirection: 'misyra_to_external',
      },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
    await server.close();
  });
});
