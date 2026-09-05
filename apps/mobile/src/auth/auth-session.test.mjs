import { describe, expect, it, vi } from 'vitest';

import { createAuthSessionController } from './auth-session.js';

const validSession = {
  accountId: 'account-a',
  accessToken: 'access-a',
  accessTokenExpiresAt: '2026-09-05T08:00:00.000Z',
  refreshToken: 'refresh-a',
  refreshTokenExpiresAt: '2026-10-05T08:00:00.000Z',
};

function harness(overrides = {}) {
  let stored = overrides.stored ?? null;
  const storage = {
    read: vi.fn(async () => stored),
    write: vi.fn(async (session) => {
      stored = session;
    }),
    clear: vi.fn(async () => {
      stored = null;
    }),
  };
  const provider = {
    signIn: vi.fn(async (name) => ({
      provider: name,
      proof: `${name}-proof`,
      nonce: 'nonce-a',
    })),
  };
  const api = {
    exchange: vi.fn(async () => validSession),
  };
  const controller = createAuthSessionController({
    storage,
    provider,
    api,
    now: () => new Date('2026-09-05T07:00:00.000Z'),
    messages: {
      signInFailed: 'Sign-in failed. Please try again.',
    },
  });
  return { controller, storage, provider, api };
}

describe('MTS-035 mobile provider sign-in', () => {
  it('restores a valid stored session silently without invoking a provider', async () => {
    const { controller, provider } = harness({ stored: validSession });

    await expect(controller.restore()).resolves.toEqual({
      status: 'signed_in',
      session: validSession,
    });
    expect(provider.signIn).not.toHaveBeenCalled();
  });

  it('keeps the device signed out when no valid session exists, with no guest state', async () => {
    const { controller } = harness();
    await expect(controller.restore()).resolves.toEqual({ status: 'signed_out' });
  });

  it.each(['apple', 'google'])(
    'exchanges %s provider proof and persists the resulting session',
    async (providerName) => {
      const { controller, storage, provider, api } = harness();

      await expect(controller.signIn(providerName)).resolves.toEqual({
        status: 'signed_in',
        session: validSession,
      });
      expect(provider.signIn).toHaveBeenCalledWith(providerName);
      expect(api.exchange).toHaveBeenCalledWith({
        provider: providerName,
        proof: `${providerName}-proof`,
        nonce: 'nonce-a',
      });
      expect(storage.write).toHaveBeenCalledWith(validSession);
    },
  );

  it('does not replace a different active account on the same device', async () => {
    const { controller, storage, api } = harness({ stored: validSession });
    api.exchange.mockResolvedValue({ ...validSession, accountId: 'account-b' });

    await controller.restore();
    await expect(controller.signIn('google')).resolves.toEqual({
      status: 'error',
      message: 'Sign-in failed. Please try again.',
    });
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('maps provider and exchange failures to localized nontechnical copy', async () => {
    const { controller, provider } = harness();
    provider.signIn.mockRejectedValue(new Error('provider oauth internals'));

    await expect(controller.signIn('apple')).resolves.toEqual({
      status: 'error',
      message: 'Sign-in failed. Please try again.',
    });
  });
});
