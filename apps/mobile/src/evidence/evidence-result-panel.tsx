import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, space, typography } from '@misyra/design-tokens';

import { themeColors, type ColorScheme } from '../design-system/index.js';
import type { EvidenceReasonMessageKey, EvidenceResultFlow } from './evidence-result-flow.js';

export type EvidenceResultMessages = Readonly<{
  waiting: string;
  accepted: string;
  rejected: string;
  expired: string;
  tryAnotherPhoto: string;
  selfConfirm: string;
  selfConfirmPrompt: string;
  confirmSelfCompletion: string;
  cancel: string;
  close: string;
  remainingAttempts: string;
  reasonTaskMismatch: string;
  reasonTaskNotEvident: string;
  reasonImageUnusable: string;
  saveToPhotos: string;
  deleteEvidence: string;
}>;

export type EvidenceResultPanelProps = Readonly<{
  flow: EvidenceResultFlow;
  messages: EvidenceResultMessages;
  colorScheme?: ColorScheme;
  onRetry(): void | Promise<void>;
  onSelfConfirm(): void | Promise<void>;
  mediaAvailable?: boolean | undefined;
  mediaDeletable?: boolean | undefined;
  onSaveToPhotos?: (() => Promise<Readonly<{ saved: boolean }>>) | undefined;
  onDeleteEvidence?: (() => void | Promise<void>) | undefined;
  onClose?: (() => void) | undefined;
}>;

function reasonCopy(key: EvidenceReasonMessageKey | null, messages: EvidenceResultMessages) {
  switch (key) {
    case 'evidence.result.reason.taskMismatch':
      return messages.reasonTaskMismatch;
    case 'evidence.result.reason.taskNotEvident':
      return messages.reasonTaskNotEvident;
    case 'evidence.result.reason.imageUnusable':
      return messages.reasonImageUnusable;
    case null:
      return null;
  }
}

export function EvidenceResultPanel({
  flow,
  messages,
  colorScheme = 'light',
  onRetry,
  onSelfConfirm,
  mediaAvailable = false,
  mediaDeletable = false,
  onSaveToPhotos,
  onDeleteEvidence,
  onClose,
}: EvidenceResultPanelProps) {
  const colors = themeColors(colorScheme);
  const [confirming, setConfirming] = useState(false);
  const title =
    flow.state === 'accepted'
      ? messages.accepted
      : flow.state === 'waiting'
        ? messages.waiting
        : flow.state === 'expired'
          ? messages.expired
          : messages.rejected;
  const reason = reasonCopy(flow.reasonMessageKey, messages);

  return (
    <View style={[styles.container, { backgroundColor: colors.canvas }]} testID="evidence-result">
      <Text allowFontScaling style={[styles.title, { color: colors.textPrimary }]}>
        {title}
      </Text>
      {reason === null ? null : (
        <Text allowFontScaling style={[styles.body, { color: colors.textSecondary }]}>
          {reason}
        </Text>
      )}
      {flow.state === 'rejected' && flow.remainingAttempts > 0 ? (
        <Text
          allowFontScaling
          style={[styles.body, { color: colors.textSecondary }]}
          testID="evidence-result-remaining-attempts"
        >
          {messages.remainingAttempts.replace('{count}', String(flow.remainingAttempts))}
        </Text>
      ) : null}
      {flow.canRetry ? (
        <Pressable
          accessibilityLabel={messages.tryAnotherPhoto}
          accessibilityRole="button"
          onPress={() => {
            void Promise.resolve(onRetry()).catch(() => undefined);
          }}
          style={[styles.secondaryAction, { borderColor: colors.border }]}
          testID="evidence-result-retry"
        >
          <Text allowFontScaling style={[styles.actionText, { color: colors.primary }]}>
            {messages.tryAnotherPhoto}
          </Text>
        </Pressable>
      ) : null}
      {flow.canSelfConfirm && !confirming ? (
        <Pressable
          accessibilityLabel={messages.selfConfirm}
          accessibilityRole="button"
          onPress={() => {
            setConfirming(true);
          }}
          style={[styles.secondaryAction, { borderColor: colors.border }]}
          testID="evidence-result-self-confirm"
        >
          <Text allowFontScaling style={[styles.actionText, { color: colors.textPrimary }]}>
            {messages.selfConfirm}
          </Text>
        </Pressable>
      ) : null}
      {flow.canSelfConfirm && confirming ? (
        <View
          style={[styles.confirmation, { backgroundColor: colors.surfaceMuted }]}
          testID="evidence-result-self-confirm-prompt"
        >
          <Text allowFontScaling style={[styles.body, { color: colors.textPrimary }]}>
            {messages.selfConfirmPrompt}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityLabel={messages.confirmSelfCompletion}
              accessibilityRole="button"
              onPress={() => {
                void Promise.resolve(onSelfConfirm()).catch(() => undefined);
              }}
              style={[styles.primaryAction, { backgroundColor: colors.primary }]}
              testID="evidence-result-self-confirm-confirm"
            >
              <Text allowFontScaling style={[styles.actionText, { color: colors.primaryText }]}>
                {messages.confirmSelfCompletion}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={messages.cancel}
              accessibilityRole="button"
              onPress={() => {
                setConfirming(false);
              }}
              style={[styles.secondaryAction, { borderColor: colors.border }]}
              testID="evidence-result-self-confirm-cancel"
            >
              <Text allowFontScaling style={[styles.actionText, { color: colors.textSecondary }]}>
                {messages.cancel}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {mediaAvailable && onSaveToPhotos !== undefined ? (
        <Pressable
          accessibilityLabel={messages.saveToPhotos}
          accessibilityRole="button"
          onPress={() => {
            void onSaveToPhotos().catch(() => undefined);
          }}
          style={[styles.secondaryAction, { borderColor: colors.border }]}
          testID="evidence-result-save-to-photos"
        >
          <Text allowFontScaling style={[styles.actionText, { color: colors.primary }]}>
            {messages.saveToPhotos}
          </Text>
        </Pressable>
      ) : null}
      {mediaAvailable && mediaDeletable && onDeleteEvidence !== undefined ? (
        <Pressable
          accessibilityLabel={messages.deleteEvidence}
          accessibilityRole="button"
          onPress={() => {
            void Promise.resolve(onDeleteEvidence()).catch(() => undefined);
          }}
          style={[styles.secondaryAction, { borderColor: colors.late }]}
          testID="evidence-result-delete-media"
        >
          <Text allowFontScaling style={[styles.actionText, { color: colors.late }]}>
            {messages.deleteEvidence}
          </Text>
        </Pressable>
      ) : null}
      {onClose === undefined ? null : (
        <Pressable
          accessibilityLabel={messages.close}
          accessibilityRole="button"
          onPress={onClose}
          style={[styles.secondaryAction, { borderColor: colors.border }]}
          testID="evidence-result-close"
        >
          <Text allowFontScaling style={[styles.actionText, { color: colors.textSecondary }]}>
            {messages.close}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space[3],
    padding: space[4],
  },
  title: {
    fontSize: typography.headline.fontSize,
    fontWeight: typography.headline.fontWeight,
  },
  body: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  confirmation: {
    borderRadius: radius.md,
    gap: space[3],
    padding: space[4],
  },
  primaryAction: {
    alignItems: 'center',
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  secondaryAction: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  actionText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
});
