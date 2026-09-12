import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  platform: 'ios',
  permission: {
    canAskAgain: false,
    granted: false,
    ios: { status: 3 },
    status: 'denied',
  },
}));

vi.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: {
    AUTHORIZED: 2,
    DENIED: 1,
    EPHEMERAL: 4,
    NOT_DETERMINED: 0,
    PROVISIONAL: 3,
  },
  getPermissionsAsync: vi.fn(async () => state.permission),
  requestPermissionsAsync: vi.fn(async () => state.permission),
  setNotificationChannelAsync: vi.fn(async () => undefined),
}));

vi.mock('react-native', () => ({
  Linking: { openSettings: vi.fn(async () => undefined) },
  Platform: {
    get OS() {
      return state.platform;
    },
  },
}));

import * as Notifications from 'expo-notifications';

import { createExpoNotificationPermissionService } from './expo-notification-permission.js';

describe('MTS-062 Expo notification permission adapter', () => {
  beforeEach(() => {
    state.platform = 'ios';
    vi.clearAllMocks();
  });

  it.each([3, 4])(
    'treats iOS authorization status %s as enabled when the generic granted flag is false',
    async (iosStatus) => {
      state.permission = {
        canAskAgain: false,
        granted: false,
        ios: { status: iosStatus },
        status: 'denied',
      };

      const service = createExpoNotificationPermissionService();

      await expect(service.getStatus()).resolves.toEqual({
        status: 'enabled',
        canRequest: false,
      });
    },
  );

  it('uses the caller-localized label for the Android permission prerequisite channel', async () => {
    state.platform = 'android';
    state.permission = {
      canAskAgain: true,
      granted: false,
      ios: { status: 0 },
      status: 'undetermined',
    };

    const service = createExpoNotificationPermissionService({ androidChannelName: '通知' });
    await service.request();

    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('mission-reminders', {
      name: '通知',
      importance: 3,
    });
  });
});
