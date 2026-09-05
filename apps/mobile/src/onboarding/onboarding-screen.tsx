import { StyleSheet, Text, View } from 'react-native';

import { space, typography } from '@misyra/design-tokens';

import {
  PrimaryButton,
  Screen,
  SecondaryButton,
  themeColors,
  type ColorScheme,
} from '../design-system/index.js';
import type { CalendarProvider, NotificationChoice, OnboardingState } from './onboarding-flow.js';

export type OnboardingMessages = {
  readonly notificationsTitle: string;
  readonly notificationsBody: string;
  readonly enableNotifications: string;
  readonly notNow: string;
  readonly calendarTitle: string;
  readonly calendarBody: string;
  readonly appleCalendar: string;
  readonly googleCalendar: string;
  readonly skipCalendar: string;
};

type OnboardingScreenProps = {
  readonly colorScheme: ColorScheme;
  readonly messages: OnboardingMessages;
  readonly state: OnboardingState;
  readonly onNotificationChoice: (choice: NotificationChoice) => void;
  readonly onCalendarChoice: (provider: CalendarProvider | null) => void;
  readonly calendarProviders?: readonly CalendarProvider[];
};

export function OnboardingScreen({
  colorScheme,
  messages,
  state,
  onNotificationChoice,
  onCalendarChoice,
  calendarProviders = ['apple', 'google'],
}: OnboardingScreenProps) {
  const colors = themeColors(colorScheme);
  if (state.step === 'complete') return null;

  const notificationStep = state.step === 'notifications';
  const title = notificationStep ? messages.notificationsTitle : messages.calendarTitle;
  const body = notificationStep ? messages.notificationsBody : messages.calendarBody;

  return (
    <Screen colorScheme={colorScheme} testID="onboarding-screen">
      <View style={styles.content}>
        <View style={styles.copy}>
          <Text
            accessibilityRole="header"
            allowFontScaling
            style={[
              styles.title,
              {
                color: colors.textPrimary,
                fontSize: typography.title3.fontSize,
                fontWeight: typography.title3.fontWeight,
              },
            ]}
          >
            {title}
          </Text>
          <Text
            allowFontScaling
            style={[
              styles.body,
              {
                color: colors.textSecondary,
                fontSize: typography.body.fontSize,
                fontWeight: typography.body.fontWeight,
              },
            ]}
          >
            {body}
          </Text>
        </View>

        <View style={styles.actions}>
          {notificationStep ? (
            <>
              <PrimaryButton
                accessibilityLabel={messages.enableNotifications}
                colorScheme={colorScheme}
                label={messages.enableNotifications}
                onPress={() => {
                  onNotificationChoice('enable');
                }}
                testID="onboarding-enable-notifications"
              />
              <SecondaryButton
                accessibilityLabel={messages.notNow}
                colorScheme={colorScheme}
                label={messages.notNow}
                onPress={() => {
                  onNotificationChoice('not_now');
                }}
                testID="onboarding-not-now"
              />
            </>
          ) : (
            <>
              {calendarProviders.includes('apple') ? (
                <SecondaryButton
                  accessibilityLabel={messages.appleCalendar}
                  colorScheme={colorScheme}
                  label={messages.appleCalendar}
                  onPress={() => {
                    onCalendarChoice('apple');
                  }}
                  testID="onboarding-calendar-apple"
                />
              ) : null}
              {calendarProviders.includes('google') ? (
                <SecondaryButton
                  accessibilityLabel={messages.googleCalendar}
                  colorScheme={colorScheme}
                  label={messages.googleCalendar}
                  onPress={() => {
                    onCalendarChoice('google');
                  }}
                  testID="onboarding-calendar-google"
                />
              ) : null}
              <PrimaryButton
                accessibilityLabel={messages.skipCalendar}
                colorScheme={colorScheme}
                label={messages.skipCalendar}
                onPress={() => {
                  onCalendarChoice(null);
                }}
                testID="onboarding-calendar-skip"
              />
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: space[3],
  },
  body: {},
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: space[8],
  },
  copy: {
    gap: space[3],
  },
  title: {},
});
