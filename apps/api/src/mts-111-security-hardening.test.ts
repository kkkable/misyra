import { describe, expect, it } from 'vitest';

import { abuseControlEnforcement } from './abuse-controls.js';
import {
  resolveAuthStartupConfiguration,
  resolveGoogleCalendarStartupConfiguration,
} from './application.js';
import { createApiServer } from './index.js';

const publicExchangeRoute = {
  method: 'POST' as const,
  path: '/auth/:provider/exchange' as const,
  public: true as const,
  handler: () => ({ exchanged: true as const }),
};

describe('MTS-111 API security hardening', () => {
  it('adds defensive response headers to operational and API responses', async () => {
    const server = createApiServer();

    const response = await server.inject({ method: 'GET', url: '/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    await server.close();
  });

  it('enforces the declared body ceiling even when a classified route omits bodyLimit', async () => {
    const server = createApiServer({ routes: [publicExchangeRoute] });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/google/exchange',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ proof: 'x'.repeat(17 * 1024) }),
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: { code: 'validation_failed' } });
    await server.close();
  });

  it('enforces the public auth-exchange rate budget per origin', async () => {
    const server = createApiServer({ routes: [publicExchangeRoute] });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/auth/google/exchange',
        remoteAddress: '203.0.113.10',
      });
      expect(response.statusCode).toBe(200);
    }

    const limited = await server.inject({
      method: 'POST',
      url: '/v1/auth/google/exchange',
      remoteAddress: '203.0.113.10',
    });
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    await server.close();
  });

  it('uses only the ACA-appended rightmost forwarded address as the public rate origin', async () => {
    const server = createApiServer({
      routes: [publicExchangeRoute],
      trustAzureContainerAppsForwardedFor: true,
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/auth/google/exchange',
        remoteAddress: '10.0.0.4',
        headers: {
          'x-forwarded-for': `198.51.100.${attempt + 1}, 203.0.113.10`,
        },
      });
      expect(response.statusCode).toBe(200);
    }

    const limited = await server.inject({
      method: 'POST',
      url: '/v1/auth/google/exchange',
      remoteAddress: '10.0.0.4',
      headers: { 'x-forwarded-for': '192.0.2.250, 203.0.113.10' },
    });
    expect(limited.statusCode).toBe(429);

    const independentOrigin = await server.inject({
      method: 'POST',
      url: '/v1/auth/google/exchange',
      remoteAddress: '10.0.0.4',
      headers: { 'x-forwarded-for': '192.0.2.250, 203.0.113.11' },
    });
    expect(independentOrigin.statusCode).toBe(200);
    await server.close();
  });

  it('ignores spoofed forwarded addresses when ACA ingress trust is not enabled', async () => {
    const server = createApiServer({ routes: [publicExchangeRoute] });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/auth/google/exchange',
        remoteAddress: '203.0.113.20',
        headers: { 'x-forwarded-for': `198.51.100.${attempt + 1}` },
      });
      expect(response.statusCode).toBe(200);
    }

    const limited = await server.inject({
      method: 'POST',
      url: '/v1/auth/google/exchange',
      remoteAddress: '203.0.113.20',
      headers: { 'x-forwarded-for': '198.51.100.250' },
    });
    expect(limited.statusCode).toBe(429);
    await server.close();
  });

  it('exposes previous auth and calendar encryption keys only as verification/decryption fallbacks', () => {
    const currentAccess = 'c'.repeat(40);
    const previousAccess = 'p'.repeat(40);
    const currentCalendar = Buffer.alloc(32, 7).toString('base64url');
    const previousCalendar = Buffer.alloc(32, 8).toString('base64url');

    const auth = resolveAuthStartupConfiguration({
      NODE_ENV: 'production',
      APPLE_AUTH_AUDIENCE: 'apple.example',
      GOOGLE_AUTH_AUDIENCE: 'google.example',
      AUTH_ACCESS_TOKEN_SECRET: currentAccess,
      AUTH_ACCESS_TOKEN_SECRET_PREVIOUS: previousAccess,
    });
    const calendar = resolveGoogleCalendarStartupConfiguration({
      NODE_ENV: 'production',
      GOOGLE_CALENDAR_CLIENT_ID: 'client-id',
      GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
      GOOGLE_CALENDAR_REDIRECT_URI: 'https://api.example.test/v1/calendars/google/callback',
      GOOGLE_CALENDAR_WEBHOOK_ADDRESS: 'https://api.example.test/v1/webhooks/google-calendar',
      GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: currentCalendar,
      GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS: previousCalendar,
    });

    expect(auth.accessTokenSecret).toBe(currentAccess);
    expect(
      (auth as typeof auth & { previousAccessTokenSecrets?: readonly string[] })
        .previousAccessTokenSecrets,
    ).toEqual([previousAccess]);
    expect(calendar.encryptionKey.equals(Buffer.alloc(32, 7))).toBe(true);
    expect(calendar.previousEncryptionKeys.map((key) => key.toString('base64url'))).toEqual([
      previousCalendar,
    ]);
  });

  it('does not claim runtime abuse controls are enforced until this ticket is green', () => {
    expect(abuseControlEnforcement).toEqual({
      status: 'enforced',
      enforcedBy: 'MTS-111',
    });
  });
});
