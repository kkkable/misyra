import { StyleSheet, Text, View } from 'react-native';

import type { ExternalCalendarInitialSyncDirection } from '@misyra/contracts';
import { space, typography } from '@misyra/design-tokens';
import type { CalendarConnectionCatalog } from '@misyra/localization';

import {
  PrimaryButton,
  Screen,
  SecondaryButton,
  themeColors,
  type ColorScheme,
} from '../design-system/index.js';
import type { CalendarConnectionFlowState } from './calendar-connection-flow.js';

type VisibleCalendarConnectionState = Exclude<
  CalendarConnectionFlowState,
  Readonly<{ step: 'idle' }> | Readonly<{ step: 'complete' }>
>;

export type CalendarConnectionScreenProps = Readonly<{
  colorScheme: ColorScheme;
  messages: CalendarConnectionCatalog;
  state: VisibleCalendarConnectionState;
  onDirectionChoice(direction: ExternalCalendarInitialSyncDirection): void;
  onConfirm(): void;
  onBack(): void;
}>;

export function CalendarConnectionScreen({
  colorScheme,
  messages,
  state,
  onDirectionChoice,
  onConfirm,
  onBack,
}: CalendarConnectionScreenProps) {
  const colors = themeColors(colorScheme);
  const confirmationCopy =
    state.step === 'confirm_initial'
      ? messages.initialConfirmation
      : state.step === 'confirm_final'
        ? messages.finalConfirmation
        : null;

  return (
    <Screen colorScheme={colorScheme} testID="calendar-connection-screen">
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
            {messages.directionTitle}
          </Text>
          {state.step === 'blocked' ? (
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
              {messages.connectionExists}
            </Text>
          ) : confirmationCopy !== null ? (
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
              {confirmationCopy}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {state.step === 'direction' ? (
            <>
              <SecondaryButton
                accessibilityLabel={messages.externalDirection}
                colorScheme={colorScheme}
                label={messages.externalDirection}
                onPress={() => {
                  onDirectionChoice('external_to_misyra');
                }}
                testID="calendar-direction-external"
              />
              <SecondaryButton
                accessibilityLabel={messages.misyraDirection}
                colorScheme={colorScheme}
                label={messages.misyraDirection}
                onPress={() => {
                  onDirectionChoice('misyra_to_external');
                }}
                testID="calendar-direction-misyra"
              />
            </>
          ) : null}
          {state.step === 'confirm_initial' ? (
            <PrimaryButton
              accessibilityLabel={messages.continue}
              colorScheme={colorScheme}
              label={messages.continue}
              onPress={onConfirm}
              testID="calendar-direction-continue"
            />
          ) : null}
          {state.step === 'confirm_final' ? (
            <PrimaryButton
              accessibilityLabel={messages.confirm}
              colorScheme={colorScheme}
              label={messages.confirm}
              onPress={onConfirm}
              testID="calendar-direction-confirm"
            />
          ) : null}
          <SecondaryButton
            accessibilityLabel={messages.back}
            colorScheme={colorScheme}
            label={messages.back}
            onPress={onBack}
            testID="calendar-direction-back"
          />
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
