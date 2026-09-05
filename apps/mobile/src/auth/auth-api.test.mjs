import { describe, expect, it, vi } from 'vitest';

import { createAuthExchangeApi } from './auth-api.js';

const session = {
  accountId: '123e4567-e89b-42d3-a456-426614174000',
  accessToken: 'fixture-access-value',
  accessTokenExpiresAt: '2026-09-05T08:00:00.000Z',
  refreshToken: 'fixture-refresh-value',
  refreshTokenExpiresAt: '2026-10-05T08:00:00.000Z',
};

describe('MTS-035/036 auth client', () => {
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

  it('posts refresh credentials and accepts only a strict rotated session payload', async () => {
    const rotated = { ...session, accessToken: 'fresh-access', refreshToken: 'fresh-refresh' };
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, payload: rotated }),
    }));
    const api = createAuthExchangeApi({ baseUrl: 'https://api.example.test', fetcher });

    await expect(api.refresh('refresh-current')).resolves.toEqual(rotated);
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/v1/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'refresh-current' }),
    });
  });

  it('posts the current refresh credential to sign out exactly this device session', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, payload: { signedOut: true } }),
    }));
    const api = createAuthExchangeApi({ baseUrl: 'https://api.example.test/', fetcher });

    await expect(api.signOut('refresh-current')).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/v1/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'refresh-current' }),
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
    ).rejects.toThrow('auth_request_failed');
  });

  it('rejects token payload fields outside the shared strict authentication contract', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, payload: { ...session, ignored: 'not-allowed' } }),
    }));
    const api = createAuthExchangeApi({ baseUrl: 'https://api.example.test', fetcher });

    await expect(
      api.exchange({ provider: 'google', proof: 'proof-a', nonce: 'nonce-a' }),
    ).rejects.toThrow('auth_exchange_failed');
  });
});
