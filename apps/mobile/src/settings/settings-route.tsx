import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { space, typography } from '@misyra/design-tokens';
import type { RecurringSeriesScope } from '@misyra/domain';
import { notificationSettingsCatalogs } from '@misyra/localization';

import { getAuthApiBaseUrl, rootAuthController } from '../auth/auth-runtime.js';
import { CalendarRecurringScopeChooser } from '../calendar/calendar-recurring-scope-chooser.js';
import {
  PrimaryButton,
  Screen,
  TopBar,
  themeColors,
  type ColorScheme,
} from '../design-system/index.js';
import { useAppLanguage } from '../localization/use-app-language.js';
import { createExpoNotificationPermissionService } from '../notifications/expo-notification-permission.js';
import type { NotificationPermissionStatus } from '../notifications/notification-permission.js';
import { rootNotificationRebuildLifecycle } from '../notifications/root-notification-rebuild-runtime.js';
import {
  createAuthenticatedSyncApi,
  type HiddenCalendarEvent,
} from '../sync/authenticated-sync-api.js';
import { rootSyncRuntime } from '../sync/root-sync-runtime.js';
import { createNotificationSettingsModel } from './notification-settings-model.js';

function hiddenEventDateLabel(
  event: HiddenCalendarEvent,
  language: 'en' | 'zh-HK',
): string {
  if (event.schedule.type === 'all_day') return event.schedule.startLocalDate;
  return new Intl.DateTimeFormat(language === 'zh-HK' ? 'zh-HK' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: event.schedule.timeZone,
  }).format(new Date(event.schedule.startInstant));
}

export function SettingsRouteScreen() {
  const language = useAppLanguage();
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const colors = themeColors(colorScheme);
  const catalog = notificationSettingsCatalogs[language];
  const permissionService = useMemo(
    () =>
      createExpoNotificationPermissionService({
        androidChannelName: catalog.notifications,
      }),
    [catalog.notifications],
  );
  const [permission, setPermission] = useState<NotificationPermissionStatus | null>(null);
  const [hiddenEvents, setHiddenEvents] = useState<readonly HiddenCalendarEvent[]>([]);
  const [selectedHiddenEvent, setSelectedHiddenEvent] = useState<HiddenCalendarEvent | null>(null);
  const [restoringHiddenEventId, setRestoringHiddenEventId] = useState<string | null>(null);

  const loadHiddenEvents = useCallback(async () => {
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in') {
      setHiddenEvents([]);
      return;
    }
    const api = createAuthenticatedSyncApi({
      baseUrl: getAuthApiBaseUrl(),
      accessToken: authState.session.accessToken,
    });
    setHiddenEvents(await api.listHiddenCalendarEvents());
  }, []);

  const refresh = useCallback(async () => {
    const [nextPermission] = await Promise.all([
      permissionService.getStatus(),
      loadHiddenEvents().catch(() => undefined),
    ]);
    setPermission(nextPermission);
  }, [loadHiddenEvents, permissionService]);

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
      const nextPermission = await permissionService.request();
      setPermission(nextPermission);
      if (nextPermission.status === 'enabled') {
        await rootNotificationRebuildLifecycle.onForeground().catch(() => undefined);
      }
      return;
    }
    await permissionService.openSettings();
  }, [model, permissionService]);

  const restoreHiddenEvent = useCallback(
    async (event: HiddenCalendarEvent, recurrenceScope: RecurringSeriesScope) => {
      setRestoringHiddenEventId(event.id);
      try {
        const authState = await rootAuthController.restore();
        if (authState.status !== 'signed_in') return;
        const api = createAuthenticatedSyncApi({
          baseUrl: getAuthApiBaseUrl(),
          accessToken: authState.session.accessToken,
        });
        await api.restoreHiddenCalendarEvent(event.id, { recurrenceScope });
        await rootSyncRuntime.run().catch(() => undefined);
        await loadHiddenEvents();
      } finally {
        setRestoringHiddenEventId(null);
        setSelectedHiddenEvent(null);
      }
    },
    [loadHiddenEvents],
  );

  return (
    <Screen colorScheme={colorScheme} testID="settings-route">
      <TopBar colorScheme={colorScheme} title={catalog.title} />
      <ScrollView contentContainerStyle={styles.content}>
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

        <View
          style={[styles.section, { borderColor: colors.border }]}
          testID="settings-hidden-events"
        >
          <Text allowFontScaling style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {catalog.hiddenCalendarEvents}
          </Text>
          {hiddenEvents.length === 0 ? (
            <Text allowFontScaling style={[styles.status, { color: colors.textSecondary }]}>
              {catalog.noHiddenCalendarEvents}
            </Text>
          ) : (
            hiddenEvents.map((event) => (
              <View
                key={event.id}
                style={[styles.hiddenEventRow, { borderColor: colors.border }]}
              >
                <View style={styles.hiddenEventText}>
                  <Text allowFontScaling style={[styles.label, { color: colors.textPrimary }]}>
                    {event.title ?? '—'}
                  </Text>
                  <Text allowFontScaling style={[styles.status, { color: colors.textSecondary }]}>
                    {hiddenEventDateLabel(event, language)}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={catalog.restoreHiddenCalendarEvent}
                  accessibilityRole="button"
                  disabled={restoringHiddenEventId !== null}
                  onPress={() => {
                    if (event.isRecurring) {
                      setSelectedHiddenEvent(event);
                    } else {
                      void restoreHiddenEvent(event, 'this_occurrence');
                    }
                  }}
                  style={styles.restoreButton}
                  testID={`hidden-event-restore-${event.id}`}
                >
                  <Text allowFontScaling style={[styles.restoreText, { color: colors.primary }]}>
                    {catalog.restoreHiddenCalendarEvent}
                  </Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {selectedHiddenEvent === null ? null : (
        <CalendarRecurringScopeChooser
          colorScheme={colorScheme}
          language={language}
          onCancel={() => {
            setSelectedHiddenEvent(null);
          }}
          onSelect={(scope) => {
            void restoreHiddenEvent(selectedHiddenEvent, scope);
          }}
          operation="restore"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[4],
    paddingBottom: space[6],
  },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space[3],
    paddingVertical: space[4],
  },
  sectionTitle: {
    fontSize: typography.headline.fontSize,
    fontWeight: typography.headline.fontWeight,
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
  },
  hiddenEventRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: space[3],
    justifyContent: 'space-between',
    minHeight: 56,
    paddingVertical: space[2],
  },
  hiddenEventText: {
    flex: 1,
    gap: space[1],
  },
  restoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: space[2],
  },
  restoreText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
});
