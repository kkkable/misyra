import { describe, expect, it, vi } from 'vitest';

import { createAuthExchangeApi } from './auth-api.js';

const session = {
  accountId: 'account-a',
  accessToken: 'access-a',
  accessTokenExpiresAt: '2026-09-05T08:00:00.000Z',
  refreshToken: 'refresh-a',
  refreshTokenExpiresAt: '2026-10-05T08:00:00.000Z',
};

describe('MTS-035 provider exchange client', () => {
  it('posts provider proof and nonce to the versioned auth exchange route', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, payload: session }),
    }));
    const api = createAuthExchangeApi({ baseUrl: 'https://api.example.test', fetcher });

    await expect(
      api.exchange({ provider: 'google', proof: 'proof-a', nonce: 'nonce-a' }),
    ).resolves.toEqual(session);
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/v1/auth/google/exchange', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proof: 'proof-a', nonce: 'nonce-a' }),
    });
  });

  it('rejects unsuccessful or malformed server responses without exposing provider internals', async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: { code: 'unauthorized' } }),
    }));
    const api = createAuthExchangeApi({ baseUrl: 'https://api.example.test/', fetcher });

    await expect(
      api.exchange({ provider: 'apple', proof: 'bad-proof', nonce: 'nonce-a' }),
    ).rejects.toThrow('auth_exchange_failed');
  });
});
