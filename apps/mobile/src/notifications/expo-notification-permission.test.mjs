import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
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
  Platform: { OS: 'ios' },
}));

import { createExpoNotificationPermissionService } from './expo-notification-permission.js';

describe('MTS-062 Expo notification permission adapter', () => {
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
});
