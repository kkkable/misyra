import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { space, typography } from '@misyra/design-tokens';
import { notificationSettingsCatalogs } from '@misyra/localization';

import {
  PrimaryButton,
  Screen,
  TopBar,
  themeColors,
  type ColorScheme,
} from '../design-system/index.js';
import { useAppLanguage } from '../localization/use-app-language.js';
import { rootNotificationPermissionService } from '../notifications/expo-notification-permission.js';
import type { NotificationPermissionStatus } from '../notifications/notification-permission.js';
import { createNotificationSettingsModel } from './notification-settings-model.js';

export function SettingsRouteScreen() {
  const language = useAppLanguage();
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const colors = themeColors(colorScheme);
  const [permission, setPermission] = useState<NotificationPermissionStatus | null>(null);

  const refresh = useCallback(async () => {
    setPermission(await rootNotificationPermissionService.getStatus());
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refresh]);

  const catalog = notificationSettingsCatalogs[language];
  const model = useMemo(
    () =>
      permission === null
        ? null
        : createNotificationSettingsModel({ messages: catalog, permission }),
    [catalog, permission],
  );

  const runAction = useCallback(async () => {
    if (model?.action === undefined || model.action === null) return;
    if (model.action.kind === 'request') {
      setPermission(await rootNotificationPermissionService.request());
      return;
    }
    await rootNotificationPermissionService.openSettings();
  }, [model]);

  return (
    <Screen colorScheme={colorScheme} testID="settings-route">
      <TopBar colorScheme={colorScheme} title={catalog.title} />
      <View style={[styles.section, { borderColor: colors.border }]}>
        <View style={styles.row}>
          <Text allowFontScaling style={[styles.label, { color: colors.textPrimary }]}>
            {catalog.notifications}
          </Text>
          {model === null ? null : (
            <Text
              accessibilityLiveRegion="polite"
              allowFontScaling
              style={[styles.status, { color: colors.textSecondary }]}
              testID="settings-notification-status"
            >
              {model.statusLabel}
            </Text>
          )}
        </View>
        {model?.action === undefined || model.action === null ? null : (
          <PrimaryButton
            accessibilityLabel={model.action.label}
            colorScheme={colorScheme}
            label={model.action.label}
            onPress={() => {
              void runAction();
            }}
            testID="settings-notification-action"
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space[3],
    paddingVertical: space[4],
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[3],
    justifyContent: 'space-between',
    minHeight: 44,
  },
  label: {
    flexShrink: 1,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
  },
  status: {
    flexShrink: 1,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    textAlign: 'right',
  },
});
