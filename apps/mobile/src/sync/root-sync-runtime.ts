import { getCalendars } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { AppleCalendarNativeModule } from '../../modules/apple-calendar/index.js';
import { getAuthApiBaseUrl, rootAuthController } from '../auth/auth-runtime.js';
import { rootNotificationRebuildLifecycle } from '../notifications/root-notification-rebuild-runtime.js';
import { openMobileDatabase } from '../storage/database.js';
import { createAuthenticatedSyncApi } from './authenticated-sync-api.js';
import {
  createAuthenticatedSyncRuntime,
  createSyncSessionProvider,
} from './authenticated-sync-runtime.js';
import { rootAppleCalendarConnectionCache } from './apple-calendar-connection-cache-runtime.js';
import { createAppleCalendarDeviceRuntime } from './apple-calendar-device-runtime.js';
import { completionSettlementChannel } from './completion-settlement-runtime.js';

const installationStore = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
};

const UUID_HEX = '0123456789abcdef';
const UUID_VARIANTS = '89ab';

function registeredDeviceIdKey(accountId: string) {
  return `misyra.device-id.v1:${accountId}`;
}

function generateInstallationId() {
  const randomPart = Math.random().toString(36).slice(2);
  return `misyra-${Date.now().toString(36)}-${randomPart}`;
}

function randomHex(length: number): string {
  return Array.from({ length }, () => UUID_HEX[Math.floor(Math.random() * UUID_HEX.length)]).join(
    '',
  );
}

function generateUuid(): string {
  const variant = UUID_VARIANTS.charAt(Math.floor(Math.random() * UUID_VARIANTS.length));
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${variant}${randomHex(3)}-${randomHex(12)}`;
}

function deviceMetadata() {
  let platform: 'ios' | 'android';
  if (Platform.OS === 'ios') platform = 'ios';
  else if (Platform.OS === 'android') platform = 'android';
  else throw new Error('unsupported_mobile_platform');

  const configuredAppVersion: unknown = process.env.EXPO_PUBLIC_APP_VERSION;
  const appVersion =
    typeof configuredAppVersion === 'string' && configuredAppVersion.length > 0
      ? configuredAppVersion
      : '0.0.0';
  const localizedTimeZone = getCalendars()[0].timeZone;
  const intlTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeZone =
    typeof localizedTimeZone === 'string' && localizedTimeZone.length > 0
      ? localizedTimeZone
      : intlTimeZone;
  if (typeof timeZone !== 'string' || timeZone.length === 0) {
    throw new Error('device_time_zone_unavailable');
  }

  return Promise.resolve({
    platform,
    appVersion,
    notificationCapability: 'not_determined' as const,
    timeZone,
  });
}

const authenticatedRootSyncRuntime = createAuthenticatedSyncRuntime({
  sessionProvider: createSyncSessionProvider(rootAuthController),
  installationStore,
  openDatabase: openMobileDatabase,
  apiFactory: (session) =>
    createAuthenticatedSyncApi({
      baseUrl: getAuthApiBaseUrl(),
      accessToken: session.accessToken,
      onCompletionSettlement: (settlement) => {
        completionSettlementChannel.publish(settlement);
      },
    }),
  generateInstallationId,
  deviceMetadata,
});

const rootAppleCalendarRuntime = createAppleCalendarDeviceRuntime({
  platform: Platform.OS,
  nativeModule: AppleCalendarNativeModule,
  accountIdProvider: async () => {
    const authState = await rootAuthController.restore();
    return authState.status === 'signed_in' ? authState.session.accountId : null;
  },
  registeredDeviceIdProvider: (accountId) =>
    installationStore.getItem(registeredDeviceIdKey(accountId)),
  remoteConnectionProvider: async (accountId) => {
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in' || authState.session.accountId !== accountId) return null;
    return createAuthenticatedSyncApi({
      baseUrl: getAuthApiBaseUrl(),
      accessToken: authState.session.accessToken,
    }).getConnectedCalendarStatus();
  },
  connectionCache: rootAppleCalendarConnectionCache,
  openDatabase: openMobileDatabase,
  generateId: generateUuid,
});

export const rootSyncRuntime = Object.freeze({
  async run() {
    let result;
    try {
      result = await authenticatedRootSyncRuntime.run();
    } catch (error) {
      await rootAppleCalendarRuntime.runBestEffortBackground();
      throw error;
    }

    if (result !== null) {
      const timeZoneChanged = result.timeZoneNotice !== undefined && result.timeZoneNotice !== null;
      await rootNotificationRebuildLifecycle
        .afterSynchronization(timeZoneChanged)
        .catch(() => undefined);
      await rootAppleCalendarRuntime.runForeground().catch(() => undefined);
    }
    return result;
  },
  runBestEffortAppleCalendarBackground() {
    return rootAppleCalendarRuntime.runBestEffortBackground();
  },
  subscribeAppleCalendarStoreChanges() {
    return rootAppleCalendarRuntime.subscribeStoreChanges();
  },
});

export async function requireRegisteredDeviceId(accountId: string): Promise<string> {
  const key = registeredDeviceIdKey(accountId);
  let deviceId = await installationStore.getItem(key);
  if (deviceId === null || deviceId.length === 0) {
    await rootSyncRuntime.run();
    deviceId = await installationStore.getItem(key);
  }
  if (deviceId === null || deviceId.length === 0) {
    throw new Error('registered_device_id_unavailable');
  }
  return deviceId;
}
