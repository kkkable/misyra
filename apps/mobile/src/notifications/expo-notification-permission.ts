import { PermissionStatus } from 'expo';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import {
  createNotificationPermissionService,
  type NativeNotificationPermissionApi,
  type NativeNotificationPermissionSnapshot,
} from './notification-permission.js';

const MISSION_REMINDER_CHANNEL_ID = 'mission-reminders';

function snapshot(
  permission: Notifications.NotificationPermissionsStatus,
): NativeNotificationPermissionSnapshot {
  const iosStatus = permission.ios?.status;
  const granted =
    permission.granted ||
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL;
  const undetermined =
    permission.status === PermissionStatus.UNDETERMINED ||
    iosStatus === Notifications.IosAuthorizationStatus.NOT_DETERMINED;
  const status = granted ? 'granted' : undetermined ? 'undetermined' : 'denied';

  return Object.freeze({
    status,
    granted,
    canAskAgain: permission.canAskAgain,
  });
}

export function createExpoNotificationPermissionService() {
  const native: NativeNotificationPermissionApi = Object.freeze({
    async getPermissions() {
      return snapshot(await Notifications.getPermissionsAsync());
    },
    async requestPermissions() {
      return snapshot(await Notifications.requestPermissionsAsync());
    },
    async prepareAndroidPermissionChannel() {
      await Notifications.setNotificationChannelAsync(MISSION_REMINDER_CHANNEL_ID, {
        name: 'Notifications',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    },
    async openSettings() {
      await Linking.openSettings();
    },
  });

  return createNotificationPermissionService({
    native,
    platform: Platform.OS === 'android' ? 'android' : 'ios',
  });
}

export const rootNotificationPermissionService = createExpoNotificationPermissionService();
