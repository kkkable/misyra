import { describe, expect, it, vi } from 'vitest';

import { AuthSessionUnauthorizedError, createAuthSessionController } from './auth-session.js';

const expiredSession = {
  accountId: '123e4567-e89b-42d3-a456-426614174000',
  accessToken: 'fixture-expired-access',
  accessTokenExpiresAt: '2026-09-06T10:00:00.000Z',
  refreshToken: 'fixture-refresh-current',
  refreshTokenExpiresAt: '2026-10-06T10:00:00.000Z',
};
const rotatedSession = {
  ...expiredSession,
  accessToken: 'fixture-fresh-access',
  accessTokenExpiresAt: '2026-09-06T11:15:00.000Z',
  refreshToken: 'fixture-refresh-rotated',
};

function createStorage() {
  let stored = expiredSession;
  return {
    read: vi.fn(() => Promise.resolve(stored)),
    write: vi.fn((session) => {
      stored = session;
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      stored = null;
      return Promise.resolve();
    }),
  };
}

function controllerFor(storage, refresh) {
  return createAuthSessionController({
    storage,
    provider: { signIn: vi.fn() },
    api: { exchange: vi.fn(), refresh, signOut: vi.fn() },
    now: () => new Date('2026-09-06T10:45:00.000Z'),
    messages: { signInFailed: 'Sign-in failed.' },
  });
}

describe('MTS-036/MTS-031 offline refresh preservation', () => {
  it(
    'preserves the rotating refresh credential across a transient refresh failure and retries it later',
    async () => {
      const storage = createStorage();
      const refresh = vi
        .fn()
        .mockRejectedValueOnce(new Error('network unavailable'))
        .mockResolvedValueOnce(rotatedSession);
      const controller = controllerFor(storage, refresh);

      await expect(controller.restore()).resolves.toEqual({ status: 'signed_out' });
      expect(storage.clear).not.toHaveBeenCalled();

      await expect(controller.restore()).resolves.toEqual({
        status: 'signed_in',
        session: rotatedSession,
      });
      expect(refresh).toHaveBeenCalledTimes(2);
      expect(storage.write).toHaveBeenCalledWith(rotatedSession);
    },
  );

  it(
    'clears the stored session when the server explicitly rejects the refresh credential',
    async () => {
      const storage = createStorage();
      const controller = controllerFor(
        storage,
        vi.fn(() => Promise.reject(new AuthSessionUnauthorizedError())),
      );

      await expect(controller.restore()).resolves.toEqual({ status: 'signed_out' });
      expect(storage.clear).toHaveBeenCalledOnce();
    },
  );
});
