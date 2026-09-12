import { describe, expect, it, vi } from 'vitest';

import { createNotificationPermissionService } from './notification-permission.js';

function snapshot(status, canAskAgain = status === 'undetermined') {
  return { status, canAskAgain, granted: status === 'granted' };
}

function harness({ platform = 'ios', initial = snapshot('undetermined') } = {}) {
  let current = initial;
  const calls = [];
  const native = {
    getPermissions: vi.fn(async () => current),
    requestPermissions: vi.fn(async () => {
      calls.push('request');
      return current;
    }),
    prepareAndroidPermissionChannel: vi.fn(async () => {
      calls.push('channel');
    }),
    openSettings: vi.fn(async () => {
      calls.push('settings');
    }),
  };
  return {
    calls,
    native,
    service: createNotificationPermissionService({ native, platform }),
    setSnapshot(next) {
      current = next;
    },
  };
}

describe('MTS-062 device-local notification permission service', () => {
  it('normalizes live system permission state without persisting account state', async () => {
    const test = harness({ initial: snapshot('undetermined') });

    await expect(test.service.getStatus()).resolves.toEqual({
      status: 'not_determined',
      canRequest: true,
    });

    test.setSnapshot(snapshot('denied', false));
    await expect(test.service.getStatus()).resolves.toEqual({
      status: 'denied',
      canRequest: false,
    });

    test.setSnapshot(snapshot('granted', false));
    await expect(test.service.getStatus()).resolves.toEqual({
      status: 'enabled',
      canRequest: false,
    });

    expect(test.native.getPermissions).toHaveBeenCalledTimes(3);
  });

  it('preserves a denied-but-requestable state when the platform allows another prompt', async () => {
    const test = harness({ initial: snapshot('denied', true) });

    await expect(test.service.getStatus()).resolves.toEqual({
      status: 'denied',
      canRequest: true,
    });
  });

  it('requests only when explicitly invoked and prepares the Android channel before the system prompt', async () => {
    const test = harness({ platform: 'android', initial: snapshot('undetermined') });

    await test.service.getStatus();
    expect(test.calls).toEqual([]);

    await test.service.request();
    expect(test.calls).toEqual(['channel', 'request']);
  });

  it('does not create an Android notification channel before an iOS permission prompt', async () => {
    const test = harness({ platform: 'ios', initial: snapshot('denied', true) });

    await test.service.request();

    expect(test.calls).toEqual(['request']);
    expect(test.native.prepareAndroidPermissionChannel).not.toHaveBeenCalled();
  });

  it('opens system settings only through an explicit caller action', async () => {
    const test = harness({ initial: snapshot('denied', false) });

    await test.service.getStatus();
    expect(test.calls).toEqual([]);

    await test.service.openSettings();
    expect(test.calls).toEqual(['settings']);
  });

  it('maps unavailable native permission access to a stable unavailable status', async () => {
    const native = {
      getPermissions: vi.fn(async () => {
        throw new Error('native_notifications_unavailable');
      }),
      requestPermissions: vi.fn(),
      prepareAndroidPermissionChannel: vi.fn(),
      openSettings: vi.fn(),
    };
    const service = createNotificationPermissionService({ native, platform: 'android' });

    await expect(service.getStatus()).resolves.toEqual({
      status: 'unavailable',
      canRequest: false,
    });
  });
});
