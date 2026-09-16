import { describe, expect, it, vi } from 'vitest';

import { createAppleCalendarDeviceRuntime } from './apple-calendar-device-runtime.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const connection = {
  id: '33333333-3333-4333-8333-333333333333',
  provider: 'apple',
  providerCalendarId: 'apple-calendar-1',
  initialSyncDirection: 'external_to_misyra',
  state: 'connected',
};

function harness(overrides = {}) {
  const cache = new Map();
  if (overrides.cachedConnection !== undefined) {
    cache.set(accountId, overrides.cachedConnection);
  }
  const connectionCache = {
    read: vi.fn((id) => Promise.resolve(cache.get(id) ?? null)),
    write: vi.fn((id, value) => {
      cache.set(id, value);
      return Promise.resolve();
    }),
    clear: vi.fn((id) => {
      cache.delete(id);
      return Promise.resolve();
    }),
  };
  let storeChangedListener = null;
  const nativeModule = {
    addListener: vi.fn((name, listener) => {
      expect(name).toBe('onStoreChanged');
      storeChangedListener = listener;
      return { remove: vi.fn() };
    }),
  };
  const sync = {
    runForeground: vi.fn(() => Promise.resolve({ status: 'synchronized', commandsApplied: 0 })),
    runBestEffortBackground: vi.fn(() =>
      Promise.resolve({ status: 'synchronized', commandsApplied: 0 }),
    ),
  };
  const createSync = vi.fn(() => sync);
  const runtime = createAppleCalendarDeviceRuntime({
    platform: overrides.platform ?? 'ios',
    nativeModule: overrides.nativeModule === null ? null : nativeModule,
    accountIdProvider: vi.fn(() => Promise.resolve(overrides.accountId ?? accountId)),
    registeredDeviceIdProvider: vi.fn(() => Promise.resolve(overrides.deviceId ?? deviceId)),
    remoteConnectionProvider:
      overrides.remoteConnectionProvider ?? vi.fn(() => Promise.resolve(connection)),
    connectionCache,
    openDatabase: vi.fn(() => Promise.resolve({ marker: 'database' })),
    generateId: () => '44444444-4444-4444-8444-444444444444',
    createSync,
  });
  return {
    runtime,
    sync,
    createSync,
    connectionCache,
    nativeModule,
    emitStoreChanged: async () => {
      if (storeChangedListener === null) throw new Error('listener_not_registered');
      storeChangedListener({ changed: true });
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('MTS-077 production EventKit device runtime', () => {
  it('refreshes and caches connected Apple metadata before running foreground EventKit sync', async () => {
    const value = harness();

    await expect(value.runtime.runForeground()).resolves.toMatchObject({ status: 'synchronized' });

    expect(value.connectionCache.write).toHaveBeenCalledWith(accountId, connection);
    expect(value.createSync).toHaveBeenCalledWith(
      expect.objectContaining({ accountId, deviceId, connection }),
    );
    expect(value.sync.runForeground).toHaveBeenCalledTimes(1);
  });

  it('uses last-known Apple metadata when the server is offline so provider pulls can still queue locally', async () => {
    const value = harness({
      cachedConnection: connection,
      remoteConnectionProvider: vi.fn(() => Promise.reject(new Error('offline'))),
    });

    await expect(value.runtime.runForeground()).resolves.toMatchObject({ status: 'synchronized' });

    expect(value.connectionCache.read).toHaveBeenCalledWith(accountId);
    expect(value.createSync).toHaveBeenCalledWith(
      expect.objectContaining({ accountId, deviceId, connection }),
    );
  });

  it('clears stale Apple metadata when the server authoritatively reports another provider or no connection', async () => {
    const google = harness({
      cachedConnection: connection,
      remoteConnectionProvider: vi.fn(() =>
        Promise.resolve({ ...connection, provider: 'google', providerCalendarId: 'primary' }),
      ),
    });
    await expect(google.runtime.runForeground()).resolves.toEqual({
      status: 'inactive',
      reason: 'connection_inactive',
    });
    expect(google.connectionCache.clear).toHaveBeenCalledWith(accountId);
    expect(google.createSync).not.toHaveBeenCalled();

    const none = harness({
      cachedConnection: connection,
      remoteConnectionProvider: vi.fn(() => Promise.resolve(null)),
    });
    await expect(none.runtime.runForeground()).resolves.toEqual({
      status: 'inactive',
      reason: 'connection_inactive',
    });
    expect(none.connectionCache.clear).toHaveBeenCalledWith(accountId);
    expect(none.createSync).not.toHaveBeenCalled();
  });

  it('does not touch EventKit on Android and keeps store-change observation single-subscription', async () => {
    const android = harness({ platform: 'android' });
    await expect(android.runtime.runForeground()).resolves.toEqual({
      status: 'inactive',
      reason: 'platform_unavailable',
    });
    expect(android.createSync).not.toHaveBeenCalled();
    expect(android.nativeModule.addListener).not.toHaveBeenCalled();

    const ios = harness();
    const first = ios.runtime.subscribeStoreChanges();
    const second = ios.runtime.subscribeStoreChanges();
    expect(ios.nativeModule.addListener).toHaveBeenCalledTimes(1);
    await ios.emitStoreChanged();
    expect(ios.sync.runBestEffortBackground).toHaveBeenCalledTimes(1);
    first.remove();
    second.remove();
  });

  it('keeps background refresh best-effort when EventKit work fails', async () => {
    const value = harness();
    value.sync.runBestEffortBackground.mockRejectedValueOnce(new Error('eventkit_unavailable'));

    await expect(value.runtime.runBestEffortBackground()).resolves.toEqual({
      status: 'inactive',
      reason: 'background_unavailable',
    });
  });
});
