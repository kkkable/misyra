import type { NotificationPermissionStatus } from '../notifications/notification-permission.js';

export type NotificationSettingsMessages = Readonly<{
  title: string;
  notifications: string;
  enabled: string;
  denied: string;
  notEnabled: string;
  unavailable: string;
  enable: string;
  openSettings: string;
}>;

export type NotificationSettingsAction = Readonly<{
  kind: 'request' | 'open_settings';
  label: string;
}>;

export type NotificationSettingsModel = Readonly<{
  title: string;
  label: string;
  statusLabel: string;
  action: NotificationSettingsAction | null;
}>;

export function createNotificationSettingsModel({
  messages,
  permission,
}: Readonly<{
  messages: NotificationSettingsMessages;
  permission: NotificationPermissionStatus;
}>): NotificationSettingsModel {
  if (permission.status === 'enabled') {
    return Object.freeze({
      title: messages.title,
      label: messages.notifications,
      statusLabel: messages.enabled,
      action: null,
    });
  }
  if (permission.status === 'not_determined') {
    return Object.freeze({
      title: messages.title,
      label: messages.notifications,
      statusLabel: messages.notEnabled,
      action: Object.freeze({ kind: 'request', label: messages.enable }),
    });
  }
  if (permission.status === 'unavailable') {
    return Object.freeze({
      title: messages.title,
      label: messages.notifications,
      statusLabel: messages.unavailable,
      action: null,
    });
  }
  return Object.freeze({
    title: messages.title,
    label: messages.notifications,
    statusLabel: messages.denied,
    action: Object.freeze({
      kind: permission.canRequest ? 'request' : 'open_settings',
      label: permission.canRequest ? messages.enable : messages.openSettings,
    }),
  });
}
