import { describe, expect, it, vi } from 'vitest';

import { createSecureSessionStorage } from './secure-session-storage.js';

const session = {
  accountId: 'account-a',
  accessToken: 'access-a',
  accessTokenExpiresAt: '2026-09-05T08:00:00.000Z',
  refreshToken: 'refresh-a',
  refreshTokenExpiresAt: '2026-10-05T08:00:00.000Z',
};

describe('MTS-035 secure session persistence', () => {
  it('persists and restores the session through the SecureStore boundary', async () => {
    let value = null;
    const secureStore = {
      getItemAsync: vi.fn(async () => value),
      setItemAsync: vi.fn(async (_key, next) => {
        value = next;
      }),
      deleteItemAsync: vi.fn(async () => {
        value = null;
      }),
    };
    const storage = createSecureSessionStorage(secureStore);

    await storage.write(session);
    await expect(storage.read()).resolves.toEqual(session);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'misyra.auth.session.v1',
      JSON.stringify(session),
    );
  });

  it('fails closed for malformed secure storage content', async () => {
    const storage = createSecureSessionStorage({
      getItemAsync: vi.fn(async () => '{bad json'),
      setItemAsync: vi.fn(),
      deleteItemAsync: vi.fn(),
    });

    await expect(storage.read()).resolves.toBeNull();
  });
});
