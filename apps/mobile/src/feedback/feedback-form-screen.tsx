import { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import { layout, radius, space, typography } from '@misyra/design-tokens';
import {
  feedbackCatalogs,
  type FeedbackCatalog,
  type LocalizationLocale,
} from '@misyra/localization';

import { SystemText as Text } from '../accessibility/system-text.js';
import {
  PrimaryButton,
  Screen,
  SecondaryButton,
  TopBar,
  themeColors,
  type ColorScheme,
} from '../design-system/index.js';
import {
  canSubmitFeedback,
  createFeedbackFormDraft,
  updateFeedbackFormDraft,
  type FeedbackCategory,
  type FeedbackFormDraft,
  type FeedbackScreenshot,
} from './feedback-form.js';
import {
  createFeedbackSubmissionPayload,
  sanitizeFeedbackTechnicalDetails,
  type FeedbackSubmissionPayload,
  type FeedbackTechnicalDetails,
} from './feedback-payload.js';

export type FeedbackFormScreenProps = Readonly<{
  language: LocalizationLocale;
  initialCategory: FeedbackCategory;
  technicalDetails: FeedbackTechnicalDetails;
  onPickScreenshot: () => Promise<FeedbackScreenshot | null>;
  onRemoveScreenshot?: (screenshot: FeedbackScreenshot) => Promise<void> | void;
  onSubmit: (payload: FeedbackSubmissionPayload) => Promise<void>;
  onDone: () => void;
  now?: () => Date;
}>;

function categoryLabel(catalog: FeedbackCatalog, category: FeedbackCategory): string {
  return category === 'problem' ? catalog.categoryProblem : catalog.categoryFeedback;
}

export function FeedbackFormScreen({
  language,
  initialCategory,
  technicalDetails,
  onPickScreenshot,
  onRemoveScreenshot,
  onSubmit,
  onDone,
  now = () => new Date(),
}: FeedbackFormScreenProps) {
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const colors = themeColors(colorScheme);
  const catalog = feedbackCatalogs[language];
  const [draft, setDraft] = useState<FeedbackFormDraft>(() =>
    createFeedbackFormDraft(initialCategory),
  );
  const [previewing, setPreviewing] = useState(false);
  const [selectingScreenshot, setSelectingScreenshot] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sanitizedTechnicalDetails = useMemo(
    () => sanitizeFeedbackTechnicalDetails(technicalDetails as Readonly<Record<string, unknown>>),
    [technicalDetails],
  );

  const chooseScreenshot = async () => {
    if (selectingScreenshot) return;
    setSelectingScreenshot(true);
    setError(null);
    try {
      const screenshot = await onPickScreenshot();
      if (screenshot === null) return;
      const previous = draft.screenshot;
      setDraft((current) => updateFeedbackFormDraft(current, { screenshot }));
      if (previous !== null && previous.uri !== screenshot.uri) {
        await onRemoveScreenshot?.(previous);
      }
    } catch {
      setError(catalog.submitFailed);
    } finally {
      setSelectingScreenshot(false);
    }
  };

  const removeScreenshot = async () => {
    const screenshot = draft.screenshot;
    if (screenshot === null) return;
    setError(null);
    try {
      await onRemoveScreenshot?.(screenshot);
      setDraft((current) => updateFeedbackFormDraft(current, { screenshot: null }));
    } catch {
      setError(catalog.submitFailed);
    }
  };

  const submit = async () => {
    if (!canSubmitFeedback(draft) || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = createFeedbackSubmissionPayload({
        draft,
        technicalDetails: {
          ...sanitizedTechnicalDetails,
          submissionTimestamp: now().toISOString(),
        },
      });
      await onSubmit(payload);
      if (draft.screenshot !== null) {
        await Promise.resolve(onRemoveScreenshot?.(draft.screenshot)).catch(() => undefined);
      }
      setSuccess(true);
    } catch {
      setError(catalog.submitFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const title = initialCategory === 'problem' ? catalog.problemTitle : catalog.sendTitle;

  if (success) {
    return (
      <Screen colorScheme={colorScheme} testID="feedback-success">
        <TopBar colorScheme={colorScheme} title={title} />
        <View style={styles.successContent}>
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="header"
            allowFontScaling
            style={[styles.successText, { color: colors.textPrimary }]}
          >
            {catalog.success}
          </Text>
          <PrimaryButton
            accessibilityLabel={catalog.done}
            colorScheme={colorScheme}
            label={catalog.done}
            onPress={onDone}
            testID="feedback-done"
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen colorScheme={colorScheme} testID="feedback-form">
      <TopBar colorScheme={colorScheme} title={title} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {previewing ? (
          <View style={styles.section} testID="feedback-preview">
            <Text
              accessibilityRole="header"
              allowFontScaling
              style={[styles.heading, { color: colors.textPrimary }]}
            >
              {catalog.previewTitle}
            </Text>
            <Text allowFontScaling style={[styles.label, { color: colors.textSecondary }]}>
              {catalog.category}
            </Text>
            <Text allowFontScaling style={[styles.value, { color: colors.textPrimary }]}>
              {categoryLabel(catalog, draft.category)}
            </Text>
            <Text allowFontScaling style={[styles.label, { color: colors.textSecondary }]}>
              {catalog.description}
            </Text>
            <Text allowFontScaling style={[styles.value, { color: colors.textPrimary }]}>
              {draft.description.trim()}
            </Text>
            {draft.email.trim().length === 0 ? null : (
              <>
                <Text allowFontScaling style={[styles.label, { color: colors.textSecondary }]}>
                  {catalog.email}
                </Text>
                <Text allowFontScaling style={[styles.value, { color: colors.textPrimary }]}>
                  {draft.email.trim()}
                </Text>
              </>
            )}
            {draft.screenshot === null ? null : (
              <Image
                accessibilityLabel={catalog.screenshot}
                accessible
                resizeMode="contain"
                source={{ uri: draft.screenshot.uri }}
                style={[styles.previewImage, { backgroundColor: colors.surfaceMuted }]}
                testID="feedback-screenshot-preview"
              />
            )}
            <View style={styles.disclosure} testID="feedback-technical-summary">
              <Text allowFontScaling style={[styles.heading, { color: colors.textPrimary }]}>
                {catalog.technicalSummaryTitle}
              </Text>
              <Text allowFontScaling style={[styles.value, { color: colors.textSecondary }]}>
                {catalog.technicalSummaryBody}
              </Text>
            </View>
            <View style={styles.disclosure} testID="feedback-retention-disclosure">
              <Text allowFontScaling style={[styles.heading, { color: colors.textPrimary }]}>
                {catalog.retentionDisclosureTitle}
              </Text>
              <Text allowFontScaling style={[styles.value, { color: colors.textSecondary }]}>
                {catalog.retentionDisclosureBody}
              </Text>
            </View>
            <PrimaryButton
              accessibilityLabel={catalog.submit}
              colorScheme={colorScheme}
              label={catalog.submit}
              loading={submitting}
              onPress={() => {
                void submit();
              }}
              testID="feedback-submit"
            />
            <SecondaryButton
              accessibilityLabel={catalog.edit}
              colorScheme={colorScheme}
              disabled={submitting}
              label={catalog.edit}
              onPress={() => {
                setPreviewing(false);
                setError(null);
              }}
              testID="feedback-edit"
            />
          </View>
        ) : (
          <>
            <View style={styles.section} testID="feedback-category">
              <Text allowFontScaling style={[styles.label, { color: colors.textSecondary }]}>
                {catalog.category}
              </Text>
              <View style={styles.categoryRow}>
                {(['feedback', 'problem'] as const).map((category) => {
                  const selected = draft.category === category;
                  return (
                    <Pressable
                      accessibilityLabel={categoryLabel(catalog, category)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={category}
                      onPress={() => {
                        setDraft((current) => updateFeedbackFormDraft(current, { category }));
                      }}
                      style={[
                        styles.categoryButton,
                        {
                          backgroundColor: selected ? colors.primarySoft : colors.surface,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                      testID={`feedback-category-${category}`}
                    >
                      <Text allowFontScaling style={[styles.value, { color: colors.textPrimary }]}>
                        {categoryLabel(catalog, category)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text allowFontScaling style={[styles.label, { color: colors.textSecondary }]}>
                {catalog.description}
              </Text>
              <TextInput
                accessibilityLabel={catalog.description}
                allowFontScaling
                multiline
                onChangeText={(description) => {
                  setDraft((current) => updateFeedbackFormDraft(current, { description }));
                }}
                placeholder={catalog.descriptionPlaceholder}
                placeholderTextColor={colors.textTertiary}
                style={[
                  styles.multilineInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.textPrimary,
                  },
                ]}
                testID="feedback-description"
                value={draft.description}
              />
            </View>

            <View style={styles.section}>
              <Text allowFontScaling style={[styles.label, { color: colors.textSecondary }]}>
                {catalog.email}
              </Text>
              <TextInput
                accessibilityLabel={catalog.email}
                allowFontScaling
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={(email) => {
                  setDraft((current) => updateFeedbackFormDraft(current, { email }));
                }}
                placeholder={catalog.emailPlaceholder}
                placeholderTextColor={colors.textTertiary}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.textPrimary,
                  },
                ]}
                testID="feedback-email"
                value={draft.email}
              />
            </View>

            <View style={styles.section} testID="feedback-screenshot">
              <Text allowFontScaling style={[styles.label, { color: colors.textSecondary }]}>
                {catalog.screenshot}
              </Text>
              {draft.screenshot === null ? (
                <SecondaryButton
                  accessibilityLabel={catalog.addScreenshot}
                  colorScheme={colorScheme}
                  disabled={selectingScreenshot}
                  label={catalog.addScreenshot}
                  onPress={() => {
                    void chooseScreenshot();
                  }}
                  testID="feedback-screenshot-add"
                />
              ) : (
                <>
                  <Image
                    accessibilityLabel={catalog.screenshot}
                    accessible
                    resizeMode="contain"
                    source={{ uri: draft.screenshot.uri }}
                    style={[styles.previewImage, { backgroundColor: colors.surfaceMuted }]}
                  />
                  <SecondaryButton
                    accessibilityLabel={catalog.replaceScreenshot}
                    colorScheme={colorScheme}
                    disabled={selectingScreenshot}
                    label={catalog.replaceScreenshot}
                    onPress={() => {
                      void chooseScreenshot();
                    }}
                    testID="feedback-screenshot-replace"
                  />
                  <SecondaryButton
                    accessibilityLabel={catalog.removeScreenshot}
                    colorScheme={colorScheme}
                    disabled={selectingScreenshot}
                    label={catalog.removeScreenshot}
                    onPress={() => {
                      void removeScreenshot();
                    }}
                    testID="feedback-screenshot-remove"
                  />
                </>
              )}
            </View>

            <PrimaryButton
              accessibilityLabel={catalog.preview}
              colorScheme={colorScheme}
              disabled={!canSubmitFeedback(draft)}
              label={catalog.preview}
              onPress={() => {
                setPreviewing(true);
                setError(null);
              }}
              testID="feedback-preview-action"
            />
          </>
        )}

        {error === null ? null : (
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            allowFontScaling
            style={[styles.error, { color: colors.destructive }]}
            testID="feedback-error"
          >
            {error}
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[4],
    paddingBottom: space[8],
  },
  section: {
    gap: space[2],
  },
  heading: {
    fontSize: typography.headline.fontSize,
    fontWeight: typography.headline.fontWeight,
  },
  label: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.mediumFontWeight,
  },
  value: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: space[2],
  },
  categoryButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: typography.body.fontSize,
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  multilineInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: typography.body.fontSize,
    minHeight: layout.minimumTouchTarget * 3,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    textAlignVertical: 'top',
  },
  previewImage: {
    borderRadius: radius.md,
    height: 180,
    width: '100%',
  },
  disclosure: {
    gap: space[2],
    paddingVertical: space[2],
  },
  error: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.mediumFontWeight,
  },
  successContent: {
    gap: space[4],
    paddingVertical: space[8],
  },
  successText: {
    fontSize: typography.title3.fontSize,
    fontWeight: typography.title3.fontWeight,
  },
});
