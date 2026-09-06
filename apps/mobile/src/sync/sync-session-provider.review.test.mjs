import { describe, expect, it, vi } from 'vitest';

import { createSyncSessionProvider } from './authenticated-sync-runtime.js';

const firstSession = {
  accountId: '11111111-1111-4111-8111-111111111111',
  accessToken: 'fixture-access-first',
  accessTokenExpiresAt: '2026-09-06T10:54:00.000Z',
  refreshToken: 'fixture-refresh-first',
  refreshTokenExpiresAt: '2026-10-06T10:39:00.000Z',
};
const rotatedSession = {
  ...firstSession,
  accessToken: 'fixture-access-rotated',
  accessTokenExpiresAt: '2026-09-06T11:09:00.000Z',
  refreshToken: 'fixture-refresh-rotated',
};

describe('MTS-031/MTS-039 synchronization session provider', () => {
  it('asks the auth controller for a current session on every synchronization run', async () => {
    const restore = vi
      .fn()
      .mockResolvedValueOnce({ status: 'signed_in', session: firstSession })
      .mockResolvedValueOnce({ status: 'signed_in', session: rotatedSession });
    const provideSession = createSyncSessionProvider({ restore });

    await expect(provideSession()).resolves.toEqual(firstSession);
    await expect(provideSession()).resolves.toEqual(rotatedSession);
    expect(restore).toHaveBeenCalledTimes(2);
  });

  it('does not hand an unusable authentication state to the sync transport', async () => {
    const signedOut = createSyncSessionProvider({
      restore: vi.fn(() => Promise.resolve({ status: 'signed_out' })),
    });
    const transientError = createSyncSessionProvider({
      restore: vi.fn(() => Promise.resolve({ status: 'error', message: 'Try again.' })),
    });

    await expect(signedOut()).resolves.toBeNull();
    await expect(transientError()).resolves.toBeNull();
  });
});
