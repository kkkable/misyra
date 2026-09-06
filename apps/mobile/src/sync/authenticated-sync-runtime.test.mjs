import { describe, expect, it, vi } from 'vitest';

import { createAuthenticatedSyncApi } from './authenticated-sync-api.js';
import { createAuthenticatedSyncRuntime } from './authenticated-sync-runtime.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const accessToken = 'fixture-access-token';
const session = {
  accountId,
  accessToken,
  accessTokenExpiresAt: '2026-09-06T10:00:00.000Z',
  refreshToken: 'fixture-refresh-token',
  refreshTokenExpiresAt: '2026-10-06T10:00:00.000Z',
};

function envelope(payload) {
  return {
    ok: true,
    json: () => Promise.resolve({ version: 1, requestId: 'request-1', ok: true, payload }),
  };
}

describe('MTS-031 authenticated sync transport correction', () => {
  it('uses the signed-in bearer token for device/settings and push/pull/snapshot requests', async () => {
    const requests = [];
    const fetcher = vi.fn((url, init) => {
      requests.push({ url, init });
      if (url.endsWith('/v1/devices/register')) return Promise.resolve(envelope({ deviceId }));
      if (url.endsWith('/v1/account/settings')) {
        return Promise.resolve(envelope({ language: 'zh-HK', trustMode: true }));
      }
      if (url.endsWith('/v1/sync/push')) {
        return Promise.resolve(envelope({ acceptedMutationIds: [], conflicts: [] }));
      }
      if (url.includes('/v1/sync/pull?')) {
        return Promise.resolve(
          envelope({ kind: 'incremental', changes: [], nextCursor: 0, hasMore: false }),
        );
      }
      if (url.endsWith('/v1/sync/snapshot')) {
        return Promise.resolve(envelope({ entries: [], nextCursor: 0 }));
      }
      return Promise.reject(new Error(`unexpected URL: ${url}`));
    });
    const api = createAuthenticatedSyncApi({
      baseUrl: 'https://api.example.test/',
      accessToken,
      fetcher,
    });

    await api.registerDevice({
      installationId: 'installation-1',
      platform: 'ios',
      appVersion: '1.2.3',
      notificationCapability: 'denied',
    });
    await api.getAccountSettings();
    await api.push([]);
    await api.pull({ cursor: 0, limit: 25 });
    await api.snapshot();

    expect(requests).toHaveLength(5);
    for (const request of requests) {
      expect(request.init.headers.authorization).toBe(`Bearer ${accessToken}`);
    }
    expect(requests.map((request) => request.url)).toEqual([
      'https://api.example.test/v1/devices/register',
      'https://api.example.test/v1/account/settings',
      'https://api.example.test/v1/sync/push',
      'https://api.example.test/v1/sync/pull?cursor=0&limit=25',
      'https://api.example.test/v1/sync/snapshot',
    ]);
  });
});

describe('MTS-039 signed-in runtime correction', () => {
  it('keeps installation identity stable, registers the device, applies account settings, and runs server sync', async () => {
    const secureValues = new Map();
    const installationStore = {
      getItem: vi.fn((key) => Promise.resolve(secureValues.get(key) ?? null)),
      setItem: vi.fn((key, value) => {
        secureValues.set(key, value);
        return Promise.resolve();
      }),
    };
    const database = {
      runAsync: vi.fn(() => Promise.resolve({ changes: 1 })),
    };
    const api = {
      registerDevice: vi.fn(() => Promise.resolve({ deviceId })),
      getAccountSettings: vi.fn(() => Promise.resolve({ language: 'zh-HK', trustMode: true })),
      push: vi.fn(() => Promise.resolve({ acceptedMutationIds: [], conflicts: [] })),
      pull: vi.fn(() =>
        Promise.resolve({ kind: 'incremental', changes: [], nextCursor: 0, hasMore: false }),
      ),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 0 })),
    };
    const runServerSync = vi.fn(() => Promise.resolve({ settledMutations: 0, cursor: 0 }));
    const runtime = createAuthenticatedSyncRuntime({
      sessionProvider: () => Promise.resolve(session),
      installationStore,
      openDatabase: () => Promise.resolve(database),
      apiFactory: vi.fn(() => api),
      runServerSync,
      generateInstallationId: () => 'installation-stable',
      deviceMetadata: () =>
        Promise.resolve({
          platform: 'ios',
          appVersion: '1.2.3',
          notificationCapability: 'denied',
        }),
      now: () => new Date('2026-09-06T09:00:00.000Z'),
    });

    const first = await runtime.run();
    const second = await runtime.run();

    expect(first).toEqual({ accountId, deviceId, cursor: 0 });
    expect(second).toEqual({ accountId, deviceId, cursor: 0 });
    expect(api.registerDevice).toHaveBeenNthCalledWith(1, {
      installationId: 'installation-stable',
      platform: 'ios',
      appVersion: '1.2.3',
      notificationCapability: 'denied',
    });
    expect(api.registerDevice).toHaveBeenNthCalledWith(2, {
      installationId: 'installation-stable',
      platform: 'ios',
      appVersion: '1.2.3',
      notificationCapability: 'denied',
    });
    expect(installationStore.setItem).toHaveBeenCalledTimes(2);
    expect(installationStore.setItem.mock.calls[0][1]).toBe('installation-stable');
    expect(installationStore.setItem.mock.calls[1][1]).toBe(deviceId);
    expect(api.getAccountSettings).toHaveBeenCalledTimes(2);
    expect(database.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO local_accounts'),
      accountId,
      'zh-HK',
      1,
      '2026-09-06T09:00:00.000Z',
    );
    expect(runServerSync).toHaveBeenCalledTimes(2);
  });
});
