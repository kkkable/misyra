import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, space, typography } from '@misyra/design-tokens';
import type { CompletionState, EvidenceState } from '@misyra/domain';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { themeColors, type ColorScheme } from '../design-system/index.js';
import { completionConfirmationRequestChannel } from './completion-confirmation-runtime.js';

export type NoEvidenceCompletionMode = 'private' | 'trust';

type CompletionLifecycle = 'future' | 'active' | 'completed' | 'expired' | 'cancelled';

type NoEvidenceCompletionState = Readonly<{
  lifecycle: CompletionLifecycle;
  completionState: CompletionState;
  evidenceState: EvidenceState;
  trustMode: boolean;
}>;

export function resolveNoEvidenceCompletionMode({
  lifecycle,
  completionState,
  evidenceState,
  trustMode,
}: NoEvidenceCompletionState): NoEvidenceCompletionMode | null {
  if (lifecycle !== 'active' || completionState !== 'incomplete') return null;
  if (evidenceState === 'pending' || evidenceState === 'accepted') return null;
  if (evidenceState === 'not_required') return 'private';
  if (trustMode) return 'trust';
  return evidenceState === 'not_submitted' ? 'private' : null;
}

type PrivateTrustCompletionPanelProps = Readonly<{
  colorScheme: ColorScheme;
  language: LocalizationLocale;
  mode: NoEvidenceCompletionMode;
  onConfirm: (mode: NoEvidenceCompletionMode) => void | Promise<void>;
}>;

export function PrivateTrustCompletionPanel({
  colorScheme,
  language,
  mode,
  onConfirm,
}: PrivateTrustCompletionPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const colors = themeColors(colorScheme);
  const catalog = localizationCatalogs[language];
  const actionLabel =
    mode === 'private'
      ? catalog['calendar.create.private']
      : catalog['calendar.mission.status.private'];

  if (!confirming) {
    return (
      <Pressable
        accessibilityLabel={actionLabel}
        accessibilityRole="button"
        onPress={() => {
          setConfirming(true);
        }}
        style={[styles.action, { borderColor: colors.border }]}
        testID="private-trust-completion-action"
      >
        <Text allowFontScaling style={[styles.actionText, { color: colors.primary }]}>
          {actionLabel}
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      accessibilityLabel={catalog['calendar.details.evidence.notRequired']}
      style={[styles.confirmation, { backgroundColor: colors.surfaceMuted }]}
      testID="private-trust-completion-confirmation"
    >
      <Text allowFontScaling style={[styles.bodyText, { color: colors.textPrimary }]}>
        {catalog['calendar.details.evidence.notRequired']}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={() => {
            void Promise.resolve(onConfirm(mode))
              .then(() => {
                completionConfirmationRequestChannel.publish();
                router.back();
              })
              .catch(() => undefined);
          }}
          style={[styles.primaryAction, { backgroundColor: colors.primary }]}
          testID="private-trust-completion-confirm"
        >
          <Text allowFontScaling style={[styles.actionText, { color: colors.primaryText }]}>
            {actionLabel}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={catalog['calendar.create.cancel']}
          accessibilityRole="button"
          onPress={() => {
            setConfirming(false);
          }}
          style={[styles.action, { borderColor: colors.border }]}
          testID="private-trust-completion-cancel"
        >
          <Text allowFontScaling style={[styles.actionText, { color: colors.textSecondary }]}>
            {catalog['calendar.create.cancel']}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  confirmation: {
    borderRadius: radius.md,
    gap: space[3],
    padding: space[4],
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  action: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  primaryAction: {
    alignItems: 'center',
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  actionText: {
    flexShrink: 1,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
  },
  bodyText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
  },
});