import { readFileSync } from 'node:fs';

import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { createApiApplication, resolveAuthStartupConfiguration } from './application.js';
import type { ProviderProofVerifier } from './auth.js';

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
