import { describe, expect, it, vi } from 'vitest';

import { createAuthSessionController } from './auth-session.js';

const expiredAccessSession = {
  accountId: '123e4567-e89b-42d3-a456-426614174000',
  accessToken: 'fixture-expired-access',
  accessTokenExpiresAt: '2026-09-05T06:59:00.000Z',
  refreshToken: 'refresh-current',
  refreshTokenExpiresAt: '2026-10-05T07:00:00.000Z',
};

const rotatedSession = {
  ...expiredAccessSession,
  accessToken: 'fixture-fresh-access',
  accessTokenExpiresAt: '2026-09-05T07:15:00.000Z',
  refreshToken: 'refresh-rotated',
};

function createHarness() {
  let stored = expiredAccessSession;
  const storage = {
    read: vi.fn(async () => stored),
    write: vi.fn(async (session) => {
      stored = session;
    }),
    clear: vi.fn(async () => {
      stored = null;
    }),
  };
  const api = {
    exchange: vi.fn(),
    refresh: vi.fn(async () => rotatedSession),
    signOut: vi.fn(async () => undefined),
  };
  const cleanup = vi.fn(async () => undefined);
  const controller = createAuthSessionController({
    storage,
    provider: { signIn: vi.fn() },
    api,
    cleanup,
    now: () => new Date('2026-09-05T07:00:00.000Z'),
    messages: { signInFailed: 'Sign-in failed. Please try again.' },
  });
  return { controller, storage, api, cleanup };
}

describe('MTS-036 device session lifecycle', () => {
  it('deduplicates concurrent silent refresh and persists the rotated session', async () => {
    const { controller, storage, api } = createHarness();

    const [first, second] = await Promise.all([controller.restore(), controller.restore()]);

    expect(first).toEqual({ status: 'signed_in', session: rotatedSession });
    expect(second).toEqual(first);
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(api.refresh).toHaveBeenCalledWith('refresh-current');
    expect(storage.write).toHaveBeenCalledTimes(1);
    expect(storage.write).toHaveBeenCalledWith(rotatedSession);
  });

  it('revokes the current device before local cleanup and clears credentials on sign-out', async () => {
    const { controller, storage, api, cleanup } = createHarness();
    await controller.restore();

    await expect(controller.signOut()).resolves.toEqual({ status: 'signed_out' });

    expect(api.signOut).toHaveBeenCalledWith('refresh-rotated');
    expect(cleanup).toHaveBeenCalledWith(expiredAccessSession.accountId);
    expect(storage.clear).toHaveBeenCalledOnce();
    expect(api.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      cleanup.mock.invocationCallOrder[0],
    );
    expect(cleanup.mock.invocationCallOrder[0]).toBeLessThan(
      storage.clear.mock.invocationCallOrder[0],
    );
  });

  it('still removes local private state when remote session revocation fails', async () => {
    const { controller, storage, api, cleanup } = createHarness();
    await controller.restore();
    api.signOut.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(controller.signOut()).rejects.toThrow('network unavailable');

    expect(cleanup).toHaveBeenCalledWith(expiredAccessSession.accountId);
    expect(storage.clear).toHaveBeenCalledOnce();
    expect(api.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      cleanup.mock.invocationCallOrder[0],
    );
    expect(cleanup.mock.invocationCallOrder[0]).toBeLessThan(
      storage.clear.mock.invocationCallOrder[0],
    );
  });

  it('clears local credentials even when account-data cleanup reports a failure', async () => {
    const { controller, storage, api, cleanup } = createHarness();
    await controller.restore();
    cleanup.mockRejectedValueOnce(new Error('local cleanup failed'));

    await expect(controller.signOut()).rejects.toThrow('local cleanup failed');

    expect(api.signOut).toHaveBeenCalledWith('refresh-rotated');
    expect(cleanup).toHaveBeenCalledWith(expiredAccessSession.accountId);
    expect(storage.clear).toHaveBeenCalledOnce();
    expect(api.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      cleanup.mock.invocationCallOrder[0],
    );
    expect(cleanup.mock.invocationCallOrder[0]).toBeLessThan(
      storage.clear.mock.invocationCallOrder[0],
    );
  });
});
