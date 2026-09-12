export type NotificationPermissionStatus =
  | Readonly<{ status: 'enabled'; canRequest: false }>
  | Readonly<{ status: 'denied'; canRequest: boolean }>
  | Readonly<{ status: 'not_determined'; canRequest: true }>
  | Readonly<{ status: 'unavailable'; canRequest: false }>;

export type NativeNotificationPermissionSnapshot = Readonly<{
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
}>;

export type NativeNotificationPermissionApi = Readonly<{
  getPermissions(): Promise<NativeNotificationPermissionSnapshot>;
  requestPermissions(): Promise<NativeNotificationPermissionSnapshot>;
  prepareAndroidPermissionChannel(): Promise<void>;
  openSettings(): Promise<void>;
}>;

type NotificationPermissionPlatform = 'ios' | 'android';

function normalizePermission(
  permission: NativeNotificationPermissionSnapshot,
): NotificationPermissionStatus {
  if (permission.granted || permission.status === 'granted') {
    return Object.freeze({ status: 'enabled', canRequest: false });
  }
  if (permission.status === 'undetermined') {
    return Object.freeze({ status: 'not_determined', canRequest: true });
  }
  return Object.freeze({ status: 'denied', canRequest: permission.canAskAgain });
}

export function createNotificationPermissionService({
  native,
  platform,
}: Readonly<{
  native: NativeNotificationPermissionApi;
  platform: NotificationPermissionPlatform;
}>) {
  return Object.freeze({
    async getStatus(): Promise<NotificationPermissionStatus> {
      try {
        return normalizePermission(await native.getPermissions());
      } catch {
        return Object.freeze({ status: 'unavailable', canRequest: false });
      }
    },
    async request(): Promise<NotificationPermissionStatus> {
      try {
        if (platform === 'android') await native.prepareAndroidPermissionChannel();
        return normalizePermission(await native.requestPermissions());
      } catch {
        return Object.freeze({ status: 'unavailable', canRequest: false });
      }
    },
    async openSettings(): Promise<void> {
      await native.openSettings();
    },
  });
}

export type NotificationPermissionService = ReturnType<typeof createNotificationPermissionService>;
