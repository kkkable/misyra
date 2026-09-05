import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { createApiApplication } from './application.js';
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
      issueAccessToken: () => 'signed-access-token',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/google/exchange',
      payload: { proof: 'provider-proof', nonce: 'nonce-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      payload: { accountId, accessToken: 'signed-access-token' },
    });
    expect(query).toHaveBeenCalledTimes(3);
    await server.close();
  });
});
