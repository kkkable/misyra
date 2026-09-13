import { describe, expect, it, vi } from 'vitest';

import type { GoogleCalendarConnectionService } from './google-calendar-connection.js';
import { createGoogleCalendarRoutes } from './google-calendar-routes.js';
import type { GoogleCalendarSyncService } from './google-calendar-sync.js';
import { createApiServer } from './index.js';

const accountId = '00000000-0000-4000-8000-000000000070';
const connectionId = '00000000-0000-4000-8000-000000000170';

describe('MTS-070 Google calendar route synchronization composition', () => {
  it('runs initial synchronization exactly once after OAuth completion', async () => {
    const completeOAuth = vi.fn(() =>
      Promise.resolve({
        id: connectionId,
        accountId,
        provider: 'google' as const,
        providerCalendarId: 'primary',
        initialSyncDirection: 'external_to_misyra' as const,
        encryptedRefreshToken: 'ciphertext-must-not-leak',
        state: 'connected' as const,
      }),
    );
    const connectionService: Pick<
      GoogleCalendarConnectionService,
      'startOAuth' | 'completeOAuth' | 'disconnect'
    > = {
      startOAuth: vi.fn(() => Promise.reject(new Error('not used'))),
      completeOAuth,
      disconnect: vi.fn(() => Promise.reject(new Error('not used'))),
    };
    const initialSync = vi.fn(() => Promise.resolve());
    const syncService: GoogleCalendarSyncService = {
      initialSync,
      incrementalSync: vi.fn(() => Promise.reject(new Error('not used'))),
    };
    const server = createApiServer({
      routes: createGoogleCalendarRoutes(connectionService, syncService),
      authenticate: () => null,
    });

    const response = await server.inject({
      method: 'GET',
      url: '/v1/calendars/google/callback?state=opaque-state&code=provider-code',
    });

    expect(response.statusCode).toBe(200);
    expect(completeOAuth).toHaveBeenCalledOnce();
    expect(initialSync).toHaveBeenCalledOnce();
    expect(initialSync).toHaveBeenCalledWith(connectionId);
    expect(completeOAuth.mock.invocationCallOrder[0]).toBeLessThan(
      initialSync.mock.invocationCallOrder[0],
    );
    await server.close();
  });
});
