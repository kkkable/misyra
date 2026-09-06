import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getAuthApiBaseUrl, rootAuthController } from '../auth/auth-runtime.js';
import { openMobileDatabase } from '../storage/database.js';
import { createAuthenticatedSyncApi } from './authenticated-sync-api.js';
import {
  createAuthenticatedSyncRuntime,
  createSyncSessionProvider,
} from './authenticated-sync-runtime.js';

const installationStore = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
};

function registeredDeviceIdKey(accountId: string) {
  return `misyra.device-id.v1:${accountId}`;
}

function generateInstallationId() {
  const randomPart = Math.random().toString(36).slice(2);
  return `misyra-${Date.now().toString(36)}-${randomPart}`;
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

  return Promise.resolve({
    platform,
    appVersion,
    notificationCapability: 'not_determined' as const,
  });
}

export const rootSyncRuntime = createAuthenticatedSyncRuntime({
  sessionProvider: createSyncSessionProvider(rootAuthController),
  installationStore,
  openDatabase: openMobileDatabase,
  apiFactory: (session) =>
    createAuthenticatedSyncApi({
      baseUrl: getAuthApiBaseUrl(),
      accessToken: session.accessToken,
    }),
  generateInstallationId,
  deviceMetadata,
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
