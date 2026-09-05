import { describe, expect, it } from 'vitest';

import {
  createDeviceSettingsService,
  type DeviceRegistrationStore,
} from './device-settings.js';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

function createStore(): DeviceRegistrationStore & {
  registrations: unknown[];
  settings: { language: 'en' | 'zh-HK'; trustMode: boolean };
} {
  const registrations: unknown[] = [];
  const state = {
    registrations,
    settings: { language: 'en' as const, trustMode: false },
    async registerDevice(input: unknown) {
      registrations.push(input);
      return '22222222-2222-4222-8222-222222222222';
    },
    async getAccountSettings() {
      return state.settings;
    },
    async updateAccountSettings(
      _accountId: string,
      settings: { language: 'en' | 'zh-HK'; trustMode: boolean },
    ) {
      state.settings = settings;
      return settings;
    },
  };
  return state;
}

describe('MTS-039 device registration and account settings sync', () => {
  it('keeps installation identity stable while recording only approved device metadata', async () => {
    const store = createStore();
    const service = createDeviceSettingsService(store);

    const first = await service.registerDevice(ACCOUNT_ID, {
      installationId: 'install-abc',
      platform: 'ios',
      appVersion: '1.2.3',
      notificationCapability: 'authorized',
    });
    const second = await service.registerDevice(ACCOUNT_ID, {
      installationId: 'install-abc',
      platform: 'ios',
      appVersion: '1.2.4',
      notificationCapability: 'denied',
    });

    expect(first.deviceId).toBe(second.deviceId);
    expect(store.registrations).toEqual([
      {
        accountId: ACCOUNT_ID,
        installationId: 'install-abc',
        platform: 'ios',
        appVersion: '1.2.3',
        notificationCapability: 'authorized',
      },
      {
        accountId: ACCOUNT_ID,
        installationId: 'install-abc',
        platform: 'ios',
        appVersion: '1.2.4',
        notificationCapability: 'denied',
      },
    ]);
    expect(JSON.stringify(store.registrations)).not.toMatch(/latitude|longitude|location/i);
  });

  it('syncs Trust Mode and app language as account state without accepting permission fields', async () => {
    const store = createStore();
    const service = createDeviceSettingsService(store);

    await expect(
      service.updateAccountSettings(ACCOUNT_ID, {
        language: 'zh-HK',
        trustMode: true,
      }),
    ).resolves.toEqual({ language: 'zh-HK', trustMode: true });

    await expect(service.getAccountSettings(ACCOUNT_ID)).resolves.toEqual({
      language: 'zh-HK',
      trustMode: true,
    });

    expect(() =>
      service.parseAccountSettingsUpdate({
        language: 'en',
        trustMode: false,
        notificationPermission: 'authorized',
      }),
    ).toThrow();
  });
});
