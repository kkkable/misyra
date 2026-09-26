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

import type { AccountSettings, CalendarConnection } from '@misyra/contracts';
import { space, typography } from '@misyra/design-tokens';
import type { RecurringSeriesScope } from '@misyra/domain';
import { notificationSettingsCatalogs } from '@misyra/localization';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getAuthApiBaseUrl, rootAuthController } from '../auth/auth-runtime.js';
import { CalendarRecurringScopeChooser } from '../calendar/calendar-recurring-scope-chooser.js';
import {
  DestructiveButton,
  Screen,
  SectionHeader,
  SettingsRow,
  ToggleRow,
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

function hiddenEventDateLabel(event: HiddenCalendarEvent, language: 'en' | 'zh-HK'): string {
  if (event.schedule.type === 'all_day') return event.schedule.startLocalDate;
  return new Intl.DateTimeFormat(language === 'zh-HK' ? 'zh-HK' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: event.schedule.timeZone,
  }).format(new Date(event.schedule.startInstant));
}

function selectedParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function SettingsRouteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const selectedEntry = selectedParam(params.section);
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
  const [accountSettings, setAccountSettings] = useState<AccountSettings | null>(null);
  const [connectedCalendar, setConnectedCalendar] = useState<CalendarConnection | null>(null);
  const [hiddenEvents, setHiddenEvents] = useState<readonly HiddenCalendarEvent[]>([]);
  const [selectedHiddenEvent, setSelectedHiddenEvent] = useState<HiddenCalendarEvent | null>(null);
  const [restoringHiddenEventId, setRestoringHiddenEventId] = useState<string | null>(null);
  const [updatingTrustMode, setUpdatingTrustMode] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const authenticatedApi = useCallback(async () => {
    const authState = await rootAuthController.restore();
    if (authState.status !== 'signed_in') return null;
    return createAuthenticatedSyncApi({
      baseUrl: getAuthApiBaseUrl(),
      accessToken: authState.session.accessToken,
    });
  }, []);

  const loadAccountSettings = useCallback(async () => {
    const api = await authenticatedApi();
    if (api === null) {
      setAccountSettings(null);
      return;
    }
    setAccountSettings(await api.getAccountSettings());
  }, [authenticatedApi]);

  const loadConnectedCalendar = useCallback(async () => {
    const api = await authenticatedApi();
    if (api === null) {
      setConnectedCalendar(null);
      return;
    }
    setConnectedCalendar(await api.getConnectedCalendarStatus());
  }, [authenticatedApi]);

  const loadHiddenEvents = useCallback(async () => {
    const api = await authenticatedApi();
    if (api === null) {
      setHiddenEvents([]);
      return;
    }
    setHiddenEvents(await api.listHiddenCalendarEvents());
  }, [authenticatedApi]);

  const refresh = useCallback(async () => {
    const [nextPermission] = await Promise.all([
      permissionService.getStatus(),
      loadAccountSettings().catch(() => undefined),
      loadConnectedCalendar().catch(() => undefined),
      loadHiddenEvents().catch(() => undefined),
    ]);
    setPermission(nextPermission);
  }, [loadAccountSettings, loadConnectedCalendar, loadHiddenEvents, permissionService]);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
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

  const connectedCalendarStatus = useMemo(() => {
    switch (connectedCalendar?.state) {
      case 'connected':
        return catalog.calendarConnected;
      case 'permission_revoked':
        return catalog.calendarPermissionRevoked;
      case 'provider_unavailable':
        return catalog.calendarProviderUnavailable;
      case 'disconnected':
        return catalog.calendarDisconnected;
      case undefined:
        return catalog.calendarDisconnected;
    }
  }, [catalog, connectedCalendar?.state]);

  const focusEntry = useCallback(
    (section: string) => {
      router.setParams({ section });
    },
    [router],
  );

  const runNotificationAction = useCallback(async () => {
    if (model?.action === undefined || model.action === null) {
      await permissionService.openSettings();
      return;
    }
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

  const updateTrustMode = useCallback(
    async (trustMode: boolean) => {
      if (updatingTrustMode) return;
      setUpdatingTrustMode(true);
      try {
        const api = await authenticatedApi();
        if (api === null) return;
        const updated = await api.updateAccountSettings({ trustMode });
        setAccountSettings(updated);
        await rootSyncRuntime.run().catch(() => undefined);
      } finally {
        setUpdatingTrustMode(false);
      }
    },
    [authenticatedApi, updatingTrustMode],
  );

  const signOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await rootAuthController.signOut();
    } finally {
      setSigningOut(false);
      router.replace('/');
    }
  }, [router, signingOut]);

  const restoreHiddenEvent = useCallback(
    async (event: HiddenCalendarEvent, recurrenceScope: RecurringSeriesScope) => {
      setRestoringHiddenEventId(event.id);
      try {
        const api = await authenticatedApi();
        if (api === null) return;
        await api.restoreHiddenCalendarEvent(event.id, { recurrenceScope });
        await rootSyncRuntime.run().catch(() => undefined);
        await loadHiddenEvents();
      } finally {
        setRestoringHiddenEventId(null);
        setSelectedHiddenEvent(null);
      }
    },
    [authenticatedApi, loadHiddenEvents],
  );

  const languageLabel =
    language === 'zh-HK' ? catalog.traditionalChineseHongKongLanguage : catalog.englishLanguage;

  return (
    <Screen colorScheme={colorScheme} testID="settings-route">
      <TopBar colorScheme={colorScheme} title={catalog.title} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.section, { borderColor: colors.border }]}>
          <SectionHeader
            colorScheme={colorScheme}
            title={catalog.accountAndPreferences}
            testID="settings-section-account-preferences"
          />
          <ToggleRow
            accessibilityLabel={catalog.trustMode}
            colorScheme={colorScheme}
            disabled={accountSettings === null || updatingTrustMode}
            label={catalog.trustMode}
            onValueChange={(value) => {
              void updateTrustMode(value);
            }}
            testID="settings-row-trust-mode"
            value={accountSettings?.trustMode ?? false}
          />
          <SettingsRow
            accessibilityLabel={catalog.connectedCalendar}
            colorScheme={colorScheme}
            label={catalog.connectedCalendar}
            onPress={() => {
              focusEntry('connected-calendar');
            }}
            selected={selectedEntry === 'connected-calendar'}
            testID="settings-row-connected-calendar"
            value={connectedCalendarStatus}
          />
          <SettingsRow
            accessibilityLabel={catalog.language}
            colorScheme={colorScheme}
            label={catalog.language}
            onPress={() => {
              focusEntry('language');
            }}
            selected={selectedEntry === 'language'}
            testID="settings-row-language"
            value={languageLabel}
          />
        </View>

        <View style={[styles.section, { borderColor: colors.border }]}>
          <SectionHeader
            colorScheme={colorScheme}
            title={catalog.privacy}
            testID="settings-section-privacy"
          />
          <SettingsRow
            accessibilityLabel={catalog.diagnostics}
            colorScheme={colorScheme}
            label={catalog.diagnostics}
            onPress={() => {
              focusEntry('diagnostics');
            }}
            selected={selectedEntry === 'diagnostics'}
            testID="settings-row-diagnostics"
          />
          <SettingsRow
            accessibilityLabel={catalog.mediaRetention}
            colorScheme={colorScheme}
            label={catalog.mediaRetention}
            onPress={() => {
              focusEntry('media-retention');
            }}
            selected={selectedEntry === 'media-retention'}
            testID="settings-row-media-retention"
          />
          <SettingsRow
            accessibilityLabel={catalog.privacyPolicy}
            colorScheme={colorScheme}
            label={catalog.privacyPolicy}
            onPress={() => {
              focusEntry('privacy-policy');
            }}
            selected={selectedEntry === 'privacy-policy'}
            testID="settings-row-privacy-policy"
          />
          <SettingsRow
            accessibilityLabel={catalog.termsOfService}
            colorScheme={colorScheme}
            label={catalog.termsOfService}
            onPress={() => {
              focusEntry('terms-of-service');
            }}
            selected={selectedEntry === 'terms-of-service'}
            testID="settings-row-terms-of-service"
          />
          <DestructiveButton
            accessibilityLabel={catalog.deleteAccount}
            colorScheme={colorScheme}
            label={catalog.deleteAccount}
            onPress={() => {
              focusEntry('delete-account');
            }}
            testID="settings-action-delete-account"
          />
        </View>

        <View style={[styles.section, { borderColor: colors.border }]}>
          <SectionHeader
            colorScheme={colorScheme}
            title={catalog.calendarAndMissions}
            testID="settings-section-calendar-missions"
          />
          <SettingsRow
            accessibilityLabel={catalog.hiddenCalendarEvents}
            colorScheme={colorScheme}
            label={catalog.hiddenCalendarEvents}
            onPress={() => {
              focusEntry('hidden-calendar-events');
            }}
            selected={selectedEntry === 'hidden-calendar-events'}
            testID="settings-row-hidden-calendar-events"
            {...(hiddenEvents.length === 0 ? {} : { value: String(hiddenEvents.length) })}
          />
          {selectedEntry === 'hidden-calendar-events' ? (
            hiddenEvents.length === 0 ? (
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
            )
          ) : null}
          <SettingsRow
            accessibilityLabel={catalog.notificationStatus}
            colorScheme={colorScheme}
            label={catalog.notificationStatus}
            onPress={() => {
              void runNotificationAction();
            }}
            selected={selectedEntry === 'notification-status'}
            testID="settings-row-notification-status"
            {...(model === null ? {} : { value: model.statusLabel })}
          />
        </View>

        <View style={[styles.section, { borderColor: colors.border }]}>
          <SectionHeader
            colorScheme={colorScheme}
            title={catalog.story}
            testID="settings-section-story"
          />
          <SettingsRow
            accessibilityLabel={catalog.storyStyleProfile}
            colorScheme={colorScheme}
            label={catalog.storyStyleProfile}
            onPress={() => {
              router.push('/story-style-profile');
            }}
            testID="settings-row-story-style-profile"
          />
        </View>

        <View style={[styles.section, { borderColor: colors.border }]}>
          <SectionHeader
            colorScheme={colorScheme}
            title={catalog.help}
            testID="settings-section-help"
          />
          <SettingsRow
            accessibilityLabel={catalog.faq}
            colorScheme={colorScheme}
            label={catalog.faq}
            onPress={() => {
              focusEntry('faq');
            }}
            selected={selectedEntry === 'faq'}
            testID="settings-row-faq"
          />
          <SettingsRow
            accessibilityLabel={catalog.sendFeedback}
            colorScheme={colorScheme}
            label={catalog.sendFeedback}
            onPress={() => {
              focusEntry('send-feedback');
            }}
            selected={selectedEntry === 'send-feedback'}
            testID="settings-row-send-feedback"
          />
          <SettingsRow
            accessibilityLabel={catalog.reportProblem}
            colorScheme={colorScheme}
            label={catalog.reportProblem}
            onPress={() => {
              focusEntry('report-problem');
            }}
            selected={selectedEntry === 'report-problem'}
            testID="settings-row-report-problem"
          />
          <SettingsRow
            accessibilityLabel={catalog.about}
            colorScheme={colorScheme}
            label={catalog.about}
            onPress={() => {
              focusEntry('about');
            }}
            selected={selectedEntry === 'about'}
            testID="settings-row-about"
          />
          <DestructiveButton
            accessibilityLabel={catalog.signOut}
            colorScheme={colorScheme}
            label={catalog.signOut}
            loading={signingOut}
            onPress={() => {
              void signOut();
            }}
            testID="settings-action-sign-out"
          />
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
    gap: space[2],
    paddingVertical: space[3],
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
