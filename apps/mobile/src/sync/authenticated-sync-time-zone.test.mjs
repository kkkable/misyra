import { describe, expect, it, vi } from 'vitest';

import { createAuthenticatedSyncRuntime } from './authenticated-sync-runtime.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const session = {
  accountId,
  accessToken: 'fixture-access-token',
  accessTokenExpiresAt: '2026-09-10T12:00:00.000Z',
  refreshToken: 'fixture-refresh-token',
  refreshTokenExpiresAt: '2026-10-10T12:00:00.000Z',
};

function createStore() {
  const values = new Map();
  return {
    getItem: vi.fn((key) => Promise.resolve(values.get(key) ?? null)),
    setItem: vi.fn((key, value) => {
      values.set(key, value);
      return Promise.resolve();
    }),
  };
}

describe('MTS-053 authenticated device-zone runtime', () => {
  it('passes the observed IANA zone during registration, applies the account app zone locally, and emits one notice only for a real device-zone transition', async () => {
    const installationStore = createStore();
    const database = { runAsync: vi.fn(() => Promise.resolve({ changes: 1 })) };
    let deviceTimeZone = 'Asia/Tokyo';
    let registrationCount = 0;
    const api = {
      registerDevice: vi.fn(() => {
        registrationCount += 1;
        return Promise.resolve({
          deviceId,
          timeZoneChanged: registrationCount > 1,
        });
      }),
      getAccountSettings: vi.fn(() =>
        Promise.resolve({
          language: 'en',
          trustMode: false,
          appTimeZone: deviceTimeZone,
        }),
      ),
      updateAccountSettings: vi.fn(),
      push: vi.fn(),
      pull: vi.fn(),
      snapshot: vi.fn(),
    };
    const runServerSync = vi.fn(() => Promise.resolve({ settledMutations: 0, cursor: 7 }));
    const runtime = createAuthenticatedSyncRuntime({
      sessionProvider: () => Promise.resolve(session),
      installationStore,
      openDatabase: () => Promise.resolve(database),
      apiFactory: () => api,
      runServerSync,
      generateInstallationId: () => 'installation-zone-runtime',
      deviceMetadata: () =>
        Promise.resolve({
          platform: 'ios',
          appVersion: '1.0.0',
          notificationCapability: 'authorized',
          timeZone: deviceTimeZone,
        }),
      now: () => new Date('2026-09-10T11:00:00.000Z'),
    });

    const initial = await runtime.run();
    expect(initial).toEqual({
      accountId,
      deviceId,
      cursor: 7,
      timeZoneNotice: null,
    });
    expect(api.registerDevice).toHaveBeenLastCalledWith({
      installationId: 'installation-zone-runtime',
      platform: 'ios',
      appVersion: '1.0.0',
      notificationCapability: 'authorized',
      timeZone: 'Asia/Tokyo',
    });
    expect(database.runAsync).toHaveBeenLastCalledWith(
      expect.stringContaining('app_time_zone'),
      accountId,
      'en',
      0,
      'Asia/Tokyo',
      '2026-09-10T11:00:00.000Z',
    );

    deviceTimeZone = 'Europe/London';
    const afterTravel = await runtime.run();
    expect(afterTravel).toEqual({
      accountId,
      deviceId,
      cursor: 7,
      timeZoneNotice: {
        language: 'en',
        timeZone: 'Europe/London',
      },
    });
    expect(api.registerDevice).toHaveBeenLastCalledWith(
      expect.objectContaining({ timeZone: 'Europe/London' }),
    );
    expect(database.runAsync).toHaveBeenLastCalledWith(
      expect.stringContaining('app_time_zone'),
      accountId,
      'en',
      0,
      'Europe/London',
      '2026-09-10T11:00:00.000Z',
    );
  });
});
