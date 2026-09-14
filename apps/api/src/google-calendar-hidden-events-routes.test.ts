import { describe, expect, it, vi } from 'vitest';

import {
  createGoogleCalendarRoutes,
  type GoogleCalendarRouteService,
} from './google-calendar-routes.js';
import { createApiServer } from './index.js';

const accountId = '00000000-0000-4000-8000-000000000073';
const connectionId = '00000000-0000-4000-8000-000000000173';
const hiddenEventId = '00000000-0000-4000-8000-000000000273';

function connectionService(): GoogleCalendarRouteService {
  return {
    startOAuth: vi.fn(() =>
      Promise.resolve({ authorizationUrl: 'https://accounts.google.test/oauth' }),
    ),
    completeOAuth: vi.fn(() =>
      Promise.resolve({
        id: connectionId,
        accountId,
        provider: 'google' as const,
        providerCalendarId: 'primary',
        initialSyncDirection: 'external_to_misyra' as const,
        encryptedRefreshToken: 'ciphertext',
        state: 'connected' as const,
      }),
    ),
    disconnect: vi.fn(() => Promise.resolve()),
  };
}

type HiddenRouteService = Readonly<{
  listHiddenEvents(accountId: string): Promise<readonly unknown[]>;
  restoreHiddenEvent(
    accountId: string,
    hiddenId: string,
    recurrenceScope: 'this_occurrence' | 'this_and_future' | 'entire_series',
  ): Promise<Readonly<{ occurrenceId: string }>>;
}>;

function routesWithHiddenService(hiddenService: HiddenRouteService) {
  const factory = createGoogleCalendarRoutes as unknown as (
    service: GoogleCalendarRouteService,
    syncService?: undefined,
    watchService?: undefined,
    hiddenEventService?: HiddenRouteService,
  ) => ReturnType<typeof createGoogleCalendarRoutes>;
  return factory(connectionService(), undefined, undefined, hiddenService);
}

describe('MTS-073 hidden calendar event routes', () => {
  it('lists only service-projected hidden events for the authenticated account', async () => {
    const listHiddenEvents = vi.fn(() =>
      Promise.resolve([
        {
          id: hiddenEventId,
          connectionId,
          providerEventId: 'provider-event-1',
          recurrenceScope: 'this_occurrence' as const,
          title: 'Current provider title',
          schedule: {
            type: 'timed' as const,
            startInstant: '2026-09-20T01:00:00.000Z',
            finishInstant: '2026-09-20T02:00:00.000Z',
            timeZone: 'Asia/Hong_Kong',
            timeBehavior: 'fixed_instant' as const,
          },
          isRecurring: true,
        },
      ]),
    );
    const server = createApiServer({
      routes: routesWithHiddenService({
        listHiddenEvents,
        restoreHiddenEvent: vi.fn(),
      }),
      authenticate: () => ({ accountId }),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/v1/calendars/hidden-events',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      payload: [{ id: hiddenEventId, title: 'Current provider title', isRecurring: true }],
    });
    expect(listHiddenEvents).toHaveBeenCalledWith(accountId);
    await server.close();
  });

  it('restores one hidden event with the selected recurrence scope and authenticated account', async () => {
    const restoreHiddenEvent = vi.fn(() =>
      Promise.resolve({ occurrenceId: '00000000-0000-4000-8000-000000000373' }),
    );
    const server = createApiServer({
      routes: routesWithHiddenService({
        listHiddenEvents: vi.fn(() => Promise.resolve([])),
        restoreHiddenEvent,
      }),
      authenticate: () => ({ accountId }),
    });

    const response = await server.inject({
      method: 'POST',
      url: `/v1/calendars/hidden-events/${hiddenEventId}/restore`,
      payload: { recurrenceScope: 'this_and_future' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      payload: { occurrenceId: '00000000-0000-4000-8000-000000000373' },
    });
    expect(restoreHiddenEvent).toHaveBeenCalledWith(accountId, hiddenEventId, 'this_and_future');
    await server.close();
  });
});
