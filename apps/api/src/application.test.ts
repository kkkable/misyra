import { readFileSync } from 'node:fs';

import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createApiApplication,
  createHmacAccessTokenAuthenticator,
  createHmacAccessTokenIssuer,
  resolveAuthStartupConfiguration,
} from './application.js';
import type { ProviderProofVerifier } from './auth.js';
import { createApiServer } from './index.js';

type FakeQueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
};

describe('MTS-034 executable API composition', () => {
  it('wires provider exchange through the PostgreSQL auth store and auth routes', async () => {
    const accountId = '123e4567-e89b-42d3-a456-426614174000';
    const query = vi.fn((sql: string): Promise<FakeQueryResult> => {
      if (sql.includes('INSERT INTO accounts')) {
        return Promise.resolve({
          rows: [{ id: accountId, provider: 'google', providerSubject: 'subject-1' }],
          rowCount: 1,
        });
      }
      if (sql.includes('consumed_provider_nonce_hashes')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (sql.includes('INSERT INTO account_sessions')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.reject(new Error(`unexpected SQL: ${sql}`));
    });
    const pool = { query } as unknown as Pool;
    const verify: ProviderProofVerifier['verify'] = (provider) =>
      Promise.resolve({
        provider,
        subject: 'subject-1',
        issuer: 'https://accounts.google.com',
        audience: 'google-audience',
        nonce: 'nonce-1',
        issuedAt: new Date('2026-09-05T08:20:00.000Z'),
        expiresAt: new Date('2026-09-05T09:20:00.000Z'),
      });
    const verifier: ProviderProofVerifier = { verify: vi.fn(verify) };
    const server = createApiApplication({
      pool,
      verifier,
      expectedAudience: { apple: 'apple-audience', google: 'google-audience' },
      now: () => new Date('2026-09-05T08:25:00.000Z'),
      issueAccessToken: () => 'fixture-access-value',
      reauthenticationProofSecret: 'fixture-reauthentication-proof-secret',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/google/exchange',
      payload: { proof: 'provider-proof', nonce: 'nonce-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      payload: { accountId, accessToken: 'fixture-access-value' },
    });
    expect(query).toHaveBeenCalledTimes(3);
    await server.close();
  });

  it('loads documented local auth startup configuration from the repository env file', () => {
    const manifest = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const envExample = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');

    expect(manifest).toContain('"start": "tsx --env-file-if-exists=../../.env src/index.ts"');
    expect(envExample).toMatch(/^APPLE_AUTH_AUDIENCE=.+$/m);
    expect(envExample).toMatch(/^GOOGLE_AUTH_AUDIENCE=.+$/m);
    expect(envExample).toMatch(/^AUTH_ACCESS_TOKEN_SECRET=.+$/m);
  });

  it('provides safe fresh-checkout auth defaults locally but requires explicit production values', () => {
    // Local fallbacks are fixtures only; production must provide every auth value explicitly.
    expect(resolveAuthStartupConfiguration({})).toEqual({
      expectedAudience: {
        apple: 'fixture-apple-auth-audience',
        google: 'fixture-google-auth-audience',
      },
      accessTokenSecret: 'fixture-local-auth-access-token-secret',
    });

    expect(() => resolveAuthStartupConfiguration({ NODE_ENV: 'production' })).toThrow(
      'Missing required environment variable: APPLE_AUTH_AUDIENCE',
    );

    expect(
      resolveAuthStartupConfiguration({
        NODE_ENV: 'production',
        APPLE_AUTH_AUDIENCE: 'production-apple-audience',
        GOOGLE_AUTH_AUDIENCE: 'production-google-audience',
        AUTH_ACCESS_TOKEN_SECRET: 'production-auth-secret-at-least-32-characters',
      }),
    ).toEqual({
      expectedAudience: {
        apple: 'production-apple-audience',
        google: 'production-google-audience',
      },
      accessTokenSecret: 'production-auth-secret-at-least-32-characters',
    });
  });
});

describe('MTS-037 session-backed access authentication', () => {
  it('rejects an otherwise unexpired access token as soon as its server session is gone', async () => {
    const accountId = '123e4567-e89b-42d3-a456-426614174000';
    const sessionId = '123e4567-e89b-42d3-a456-426614174010';
    const secret = 'fixture-session-backed-access-secret-32';
    const now = new Date('2026-09-05T15:00:00.000Z');
    let active = true;
    const isSessionActive = vi.fn(() => Promise.resolve(active));
    const authenticate = createHmacAccessTokenAuthenticator(secret, isSessionActive, () => now);
    const accessToken = createHmacAccessTokenIssuer(secret)({
      accountId,
      sessionId,
      expiresAt: new Date('2026-09-05T15:10:00.000Z'),
    });
    const server = createApiServer({
      authenticate,
      routes: [
        {
          method: 'GET',
          path: '/account/session-proof',
          handler: (_request, _reply, auth) => ({ accountId: auth.accountId }),
        },
      ],
    });

    const accepted = await server.inject({
      method: 'GET',
      url: '/v1/account/session-proof',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    active = false;
    const rejected = await server.inject({
      method: 'GET',
      url: '/v1/account/session-proof',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ ok: true, payload: { accountId } });
    expect(rejected.statusCode).toBe(401);
    expect(isSessionActive).toHaveBeenCalledTimes(2);
    await server.close();
  });
});
