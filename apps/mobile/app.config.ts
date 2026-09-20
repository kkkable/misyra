import type { ConfigContext } from 'expo/config';

const ANDROID_EXACT_ALARM_PERMISSION = 'android.permission.SCHEDULE_EXACT_ALARM';
const rawEventKitPermissionCopy: unknown = process.env.MISYRA_EVENTKIT_PERMISSION_COPY;
const eventKitPermissionCopy =
  typeof rawEventKitPermissionCopy === 'string' && rawEventKitPermissionCopy.trim().length > 0
    ? rawEventKitPermissionCopy.trim()
    : null;

const eventKitInfoPlist = eventKitPermissionCopy
  ? {
      NSCalendarsUsageDescription: eventKitPermissionCopy,
      NSCalendarsFullAccessUsageDescription: eventKitPermissionCopy,
    }
  : {};

export default ({ config }: ConfigContext) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    [
      'expo-camera',
      {
        cameraPermission: 'Allow Misyra to use the camera to capture mission evidence.',
        recordAudioAndroid: false,
        barcodeScannerEnabled: false,
      },
    ],
    [
      'expo-media-library',
      {
        photosPermission: 'Allow Misyra to access photos you choose.',
        savePhotosPermission:
          'Allow Misyra to save evidence photos when you choose Save to Photos.',
        granularPermissions: ['photo'],
      },
    ],
  ],
  android: {
    ...config.android,
    permissions: Array.from(
      new Set([...(config.android?.permissions ?? []), ANDROID_EXACT_ALARM_PERMISSION]),
    ),
  },
  ios: {
    ...config.ios,
    infoPlist: {
      ...config.ios?.infoPlist,
      ...eventKitInfoPlist,
    },
  },
});
