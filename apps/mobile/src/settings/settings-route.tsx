import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';

import type { AccountSettings, CalendarConnection } from '@misyra/contracts';
import { radius, space, typography } from '@misyra/design-tokens';
import type { RecurringSeriesScope } from '@misyra/domain';
import {
  formatRegionalNumber,
  formatRegionalNumericDate,
  helpLegalCatalogs,
  localizationCatalogs,
  notificationSettingsCatalogs,
  type LocalizationLocale,
} from '@misyra/localization';
import * as Application from 'expo-application';
import { getCalendars, getLocales } from 'expo-localization';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { SystemText as Text } from '../accessibility/system-text.js';
import { getAuthApiBaseUrl, rootAuthController } from '../auth/auth-runtime.js';
import { CalendarRecurringScopeChooser } from '../calendar/calendar-recurring-scope-chooser.js';
import { rootDiagnosticsRuntime } from '../diagnostics/mobile-diagnostics.js';
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
import { publishAppLanguage } from '../localization/app-language-runtime.js';
import { useAppLanguage } from '../localization/use-app-language.js';
import { createExpoNotificationPermissionService } from '../notifications/expo-notification-permission.js';
import type { NotificationPermissionStatus } from '../notifications/notification-permission.js';
import { rootNotificationRebuildLifecycle } from '../notifications/root-notification-rebuild-runtime.js';
import {
  createAuthenticatedSyncApi,
  type HiddenCalendarEvent,
} from '../sync/authenticated-sync-api.js';
import { rootSyncRuntime } from '../sync/root-sync-runtime.js';
import { openHelpLegalUrl, resolveHelpLegalConfiguration } from './help-legal-config.js';
import { createNotificationSettingsModel } from './notification-settings-model.js';

function localDateForFormatting(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) throw new RangeError('Invalid hidden-event local date.');
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function hiddenEventDateLabel(
  event: HiddenCalendarEvent,
  regionalLocale: string,
  uses24HourClock: boolean,
): string {
  if (event.schedule.type === 'all_day') {
    return formatRegionalNumericDate(
      localDateForFormatting(event.schedule.startLocalDate),
      regionalLocale,
    );
  }

  const start = new Date(event.schedule.startInstant);
  const date = formatRegionalNumericDate(start, regionalLocale, event.schedule.timeZone);
  const time = new Intl.DateTimeFormat(regionalLocale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !uses24HourClock,
    timeZone: event.schedule.timeZone,
  }).format(start);
  return `${date} ${time}`;
}

function selectedParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type InformationEntry = Readonly<{
  question: string;
  answer: string;
}>;

type SettingsInformationPanelProps = Readonly<{
  colorScheme: ColorScheme;
  title: string;
  paragraphs: readonly string[];
  entries?: readonly InformationEntry[];
  actionLabel?: string;
  onAction?: () => void;
  testID: string;
}>;

function SettingsInformationPanel({
  colorScheme,
  title,
  paragraphs,
  entries = [],
  actionLabel,
  onAction,
  testID,
}: SettingsInformationPanelProps) {
  const colors = themeColors(colorScheme);
  return (
    <View
      style={[
        styles.informationPanel,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      testID={testID}
    >
      <Text
        accessibilityRole="header"
        allowFontScaling
        style={[styles.informationTitle, { color: colors.textPrimary }]}
      >
        {title}
      </Text>
      {paragraphs.map((paragraph) => (
        <Text
          allowFontScaling
          key={paragraph}
          style={[styles.informationBody, { color: colors.textSecondary }]}
        >
          {paragraph}
        </Text>
      ))}
      {entries.map((entry) => (
        <View key={entry.question} style={styles.informationEntry}>
          <Text
            allowFontScaling
            style={[styles.informationQuestion, { color: colors.textPrimary }]}
          >
            {entry.question}
          </Text>
          <Text allowFontScaling style={[styles.informationBody, { color: colors.textSecondary }]}>
            {entry.answer}
          </Text>
        </View>
      ))}
      {actionLabel === undefined || onAction === undefined ? null : (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="link"
          onPress={onAction}
          style={styles.informationAction}
        >
          <Text allowFontScaling style={[styles.informationActionText, { color: colors.primary }]}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function SettingsRouteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const selectedEntry = selectedParam(params.section);
  const language = useAppLanguage();
  const regionalLocale = getLocales().at(0)?.languageTag ?? language;
  const uses24HourClock = getCalendars().at(0)?.uses24hourClock !== false;
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const colors = themeColors(colorScheme);
  const catalog = notificationSettingsCatalogs[language];
  const generalCatalog = localizationCatalogs[language];
  const helpLegalCatalog = helpLegalCatalogs[language];
  const configuredPrivacyPolicyUrl: unknown = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
  const configuredTermsOfServiceUrl: unknown = process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL;
  const helpLegalConfiguration = useMemo(
    () =>
      resolveHelpLegalConfiguration({
        privacyPolicyUrl:
          typeof configuredPrivacyPolicyUrl === 'string' ? configuredPrivacyPolicyUrl : undefined,
        termsOfServiceUrl:
          typeof configuredTermsOfServiceUrl === 'string' ? configuredTermsOfServiceUrl : undefined,
      }),
    [configuredPrivacyPolicyUrl, configuredTermsOfServiceUrl],
  );
  const installedAppVersion = Application.nativeApplicationVersion ?? '0.0.0';
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
  const [restoreScopeReturnFocusTarget, setRestoreScopeReturnFocusTarget] = useState<unknown>(null);
  const [restoringHiddenEventId, setRestoringHiddenEventId] = useState<string | null>(null);
  const [updatingTrustMode, setUpdatingTrustMode] = useState(false);
  const [updatingDiagnostics, setUpdatingDiagnostics] = useState(false);
  const [updatingLanguage, setUpdatingLanguage] = useState(false);
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
    const settings = await api.getAccountSettings();
    rootDiagnosticsRuntime.setEnabled(settings.diagnosticsEnabled);
    setAccountSettings(settings);
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

  const updateDiagnostics = useCallback(
    async (enabled: boolean) => {
      if (updatingDiagnostics) return;
      rootDiagnosticsRuntime.setEnabled(enabled);
      setAccountSettings((current) =>
        current === null ? current : { ...current, diagnosticsEnabled: enabled },
      );
      setUpdatingDiagnostics(true);
      try {
        const api = await authenticatedApi();
        if (api === null) return;
        const updated = await api.updateAccountSettings({ diagnosticsEnabled: enabled });
        setAccountSettings(updated);
        await rootSyncRuntime.run().catch(() => undefined);
      } finally {
        setUpdatingDiagnostics(false);
      }
    },
    [authenticatedApi, updatingDiagnostics],
  );

  const updateLanguage = useCallback(
    async (nextLanguage: LocalizationLocale) => {
      if (updatingLanguage) return;
      if (accountSettings?.language === nextLanguage) {
        publishAppLanguage(nextLanguage);
        return;
      }
      setUpdatingLanguage(true);
      try {
        const api = await authenticatedApi();
        if (api === null) return;
        const updated = await api.updateAccountSettings({ language: nextLanguage });
        setAccountSettings(updated);
        publishAppLanguage(updated.language);
        await rootSyncRuntime.run().catch(() => undefined);
      } finally {
        setUpdatingLanguage(false);
      }
    },
    [accountSettings?.language, authenticatedApi, updatingLanguage],
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
          <View testID="settings-connected-calendar">
            <SettingsRow
              accessibilityLabel={catalog.connectedCalendar}
              colorScheme={colorScheme}
              label={catalog.connectedCalendar}
              onPress={() => {
                focusEntry('connected-calendar');
              }}
              selected={selectedEntry === 'connected-calendar'}
              testID="settings-row-connected-calendar"
            />
            <Text
              accessibilityLiveRegion="polite"
              allowFontScaling
              style={[styles.status, { color: colors.textSecondary }]}
              testID="settings-connected-calendar-status"
            >
              {connectedCalendarStatus}
            </Text>
          </View>
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
          {selectedEntry === 'language' ? (
            <View testID="settings-language-options">
              <SettingsRow
                accessibilityLabel={catalog.englishLanguage}
                colorScheme={colorScheme}
                label={catalog.englishLanguage}
                onPress={() => {
                  void updateLanguage('en');
                }}
                selected={language === 'en'}
                testID="settings-language-option-en"
              />
              <SettingsRow
                accessibilityLabel={catalog.traditionalChineseHongKongLanguage}
                colorScheme={colorScheme}
                label={catalog.traditionalChineseHongKongLanguage}
                onPress={() => {
                  void updateLanguage('zh-HK');
                }}
                selected={language === 'zh-HK'}
                testID="settings-language-option-zh-HK"
              />
            </View>
          ) : null}
        </View>

        <View style={[styles.section, { borderColor: colors.border }]}>
          <SectionHeader
            colorScheme={colorScheme}
            title={catalog.privacy}
            testID="settings-section-privacy"
          />
          <ToggleRow
            accessibilityLabel={catalog.diagnostics}
            colorScheme={colorScheme}
            disabled={accountSettings === null || updatingDiagnostics}
            label={catalog.diagnostics}
            onValueChange={(enabled) => {
              void updateDiagnostics(enabled);
            }}
            testID="settings-row-diagnostics"
            value={accountSettings?.diagnosticsEnabled ?? true}
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
          {selectedEntry === 'privacy-policy' ? (
            <SettingsInformationPanel
              colorScheme={colorScheme}
              paragraphs={[
                helpLegalCatalog.privacySummary,
                helpLegalCatalog.privacyFeedbackRetention,
              ]}
              testID="help-legal-privacy-panel"
              title={helpLegalCatalog.privacyTitle}
              {...(helpLegalConfiguration.privacyPolicyUrl === null
                ? {}
                : {
                    actionLabel: helpLegalCatalog.privacyOpenPolicy,
                    onAction: () => {
                      void openHelpLegalUrl(helpLegalConfiguration.privacyPolicyUrl).catch(
                        () => undefined,
                      );
                    },
                  })}
            />
          ) : null}
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
          {selectedEntry === 'terms-of-service' ? (
            <SettingsInformationPanel
              colorScheme={colorScheme}
              paragraphs={[helpLegalCatalog.termsSummary]}
              testID="help-legal-terms-panel"
              title={helpLegalCatalog.termsTitle}
              {...(helpLegalConfiguration.termsOfServiceUrl === null
                ? {}
                : {
                    actionLabel: helpLegalCatalog.termsOpen,
                    onAction: () => {
                      void openHelpLegalUrl(helpLegalConfiguration.termsOfServiceUrl).catch(
                        () => undefined,
                      );
                    },
                  })}
            />
          ) : null}
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
            {...(hiddenEvents.length === 0
              ? {}
              : { value: formatRegionalNumber(hiddenEvents.length, regionalLocale) })}
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
                      {hiddenEventDateLabel(event, regionalLocale, uses24HourClock)}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={catalog.restoreHiddenCalendarEvent}
                    accessibilityRole="button"
                    disabled={restoringHiddenEventId !== null}
                    onPress={(pressEvent) => {
                      if (event.isRecurring) {
                        setRestoreScopeReturnFocusTarget(pressEvent.currentTarget);
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
            accessibilityLabel={generalCatalog['story.styleProfile.settings']}
            colorScheme={colorScheme}
            label={generalCatalog['story.styleProfile.settings']}
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
          {selectedEntry === 'faq' ? (
            <SettingsInformationPanel
              colorScheme={colorScheme}
              entries={helpLegalCatalog.faqEntries}
              paragraphs={[helpLegalCatalog.faqIntro]}
              testID="help-legal-faq-panel"
              title={helpLegalCatalog.faqTitle}
            />
          ) : null}
          <SettingsRow
            accessibilityLabel={catalog.sendFeedback}
            colorScheme={colorScheme}
            label={catalog.sendFeedback}
            onPress={() => {
              router.push({ pathname: '/feedback', params: { category: 'feedback' } });
            }}
            selected={selectedEntry === 'send-feedback'}
            testID="settings-row-send-feedback"
          />
          <SettingsRow
            accessibilityLabel={catalog.reportProblem}
            colorScheme={colorScheme}
            label={catalog.reportProblem}
            onPress={() => {
              router.push({ pathname: '/feedback', params: { category: 'problem' } });
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
          {selectedEntry === 'about' ? (
            <SettingsInformationPanel
              colorScheme={colorScheme}
              paragraphs={[
                helpLegalCatalog.aboutBody,
                helpLegalCatalog.versionLabel.replace('{version}', installedAppVersion),
              ]}
              testID="help-legal-about-panel"
              title={helpLegalCatalog.aboutTitle}
            />
          ) : null}
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
            setRestoreScopeReturnFocusTarget(null);
          }}
          onSelect={(scope) => {
            setRestoreScopeReturnFocusTarget(null);
            void restoreHiddenEvent(selectedHiddenEvent, scope);
          }}
          operation="restore"
          returnFocusTarget={restoreScopeReturnFocusTarget}
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
  informationPanel: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[2],
    marginHorizontal: space[2],
    padding: space[3],
  },
  informationTitle: {
    fontSize: typography.headline.fontSize,
    fontWeight: typography.headline.fontWeight,
  },
  informationBody: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
  },
  informationEntry: {
    gap: space[1],
    paddingVertical: space[1],
  },
  informationQuestion: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
  informationAction: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: space[1],
  },
  informationActionText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
});
