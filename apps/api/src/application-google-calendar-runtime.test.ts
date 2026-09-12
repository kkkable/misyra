import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createApiApplication,
  resolveGoogleCalendarStartupConfiguration,
} from './application.js';
import type {
  GoogleCalendarOAuthGateway,
  GoogleCalendarTokenCipher,
} from './google-calendar-connection.js';

const accountId = '00000000-0000-4000-8000-000000000069';
const connectionId = '00000000-0000-4000-8000-000000000169';

type FakeQueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
};

describe('MTS-069 executable Google calendar composition', () => {
  it('mounts the authenticated connect route through the PostgreSQL store', async () => {
    const query = vi.fn((sql: string): Promise<FakeQueryResult> => {
      if (sql.includes('INSERT INTO external_calendar_connections')) {
        return Promise.resolve({ rows: [{ id: connectionId }], rowCount: 1 });
      }
      return Promise.reject(new Error(`unexpected SQL: ${sql}`));
    });
    const pool = { query } as unknown as Pool;
    const provider: GoogleCalendarOAuthGateway = {
      buildAuthorizationUrl: vi.fn(
        ({ state }) => `https://accounts.google.test/oauth?state=${state}`,
      ),
      exchangeCode: vi.fn(() => Promise.reject(new Error('not used'))),
      createDedicatedCalendar: vi.fn(() => Promise.reject(new Error('not used'))),
      revokeRefreshToken: vi.fn(() => Promise.reject(new Error('not used'))),
    };
    const cipher: GoogleCalendarTokenCipher = {
      encrypt: vi.fn(() => Promise.reject(new Error('not used'))),
      decrypt: vi.fn(() => Promise.reject(new Error('not used'))),
    };
    const server = createApiApplication({
      pool,
      expectedAudience: { apple: 'apple-audience', google: 'google-audience' },
      issueAccessToken: () => 'fixture-access-token',
      reauthenticationProofSecret: 'fixture-reauthentication-proof-secret',
      verifier: { verify: () => Promise.reject(new Error('not used')) },
      authenticate: () => ({ accountId }),
      googleCalendar: { provider, cipher },
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
      payload: {
        authorizationUrl: expect.stringContaining('https://accounts.google.test/oauth'),
      },
    });
    expect(query).toHaveBeenCalledOnce();
    expect(provider.buildAuthorizationUrl).toHaveBeenCalledOnce();
    await server.close();
  });

  it(
    'uses local-safe fixtures but requires explicit production Google calendar configuration',
    () => {
      const local = resolveGoogleCalendarStartupConfiguration({});
      expect(local.clientId).toBe('fixture-google-calendar-client-id');
      expect(local.clientSecret).toBe('fixture-google-calendar-client-secret');
      expect(local.redirectUri).toBe('http://127.0.0.1:3000/v1/calendars/google/callback');
      expect(local.encryptionKey).toHaveLength(32);

      expect(() => resolveGoogleCalendarStartupConfiguration({ NODE_ENV: 'production' })).toThrow(
        'Missing required environment variable: GOOGLE_CALENDAR_CLIENT_ID',
      );
    },
  );
});
