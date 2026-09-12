import type { ConfigContext } from 'expo/config';

const ANDROID_EXACT_ALARM_PERMISSION = 'android.permission.SCHEDULE_EXACT_ALARM';

export default ({ config }: ConfigContext) => ({
  ...config,
  android: {
    ...config.android,
    permissions: Array.from(
      new Set([...(config.android?.permissions ?? []), ANDROID_EXACT_ALARM_PERMISSION]),
    ),
  },
});
