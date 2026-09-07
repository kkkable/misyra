import { Pressable, StyleSheet, Text, View } from 'react-native';

import { layout, radius, space, typography } from '@misyra/design-tokens';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { themeColors, type ColorScheme } from '../design-system/index.js';
import type { AllowedMissionAdjustment } from './calendar-mission-adjustment.js';

interface MissionAdjustmentFeedbackProps {
  readonly adjustment: AllowedMissionAdjustment;
  readonly colorScheme: ColorScheme;
  readonly language: LocalizationLocale;
  readonly onUndo: () => unknown;
}

function adjustmentMessage(
  adjustment: AllowedMissionAdjustment,
  language: LocalizationLocale,
): string {
  const catalog = localizationCatalogs[language];
  if (adjustment.warning === 'after_start_zero_xp') {
    return catalog['calendar.edit.afterStartZeroXpWarning'];
  }
  if (adjustment.warning === 'past_zero_xp') {
    return catalog['calendar.create.pastZeroXpWarning'];
  }
  return catalog['calendar.adjustment.saved'];
}

export function MissionAdjustmentFeedback({
  adjustment,
  colorScheme,
  language,
  onUndo,
}: MissionAdjustmentFeedbackProps) {
  const colors = themeColors(colorScheme);
  const catalog = localizationCatalogs[language];

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
      ]}
      testID="calendar-adjustment-feedback"
    >
      <Text
        allowFontScaling
        style={[styles.message, { color: colors.textPrimary }]}
        testID="calendar-adjustment-feedback-message"
      >
        {adjustmentMessage(adjustment, language)}
      </Text>
      <Pressable
        accessibilityLabel={catalog['calendar.adjustment.undo']}
        accessibilityRole="button"
        onPress={() => {
          void onUndo();
        }}
        style={({ pressed }) => [
          styles.undoButton,
          { backgroundColor: pressed ? colors.primarySoft : colors.surfaceRaised },
        ]}
        testID="calendar-adjustment-undo"
      >
        <Text allowFontScaling style={[styles.undoLabel, { color: colors.primary }]}>
          {catalog['calendar.adjustment.undo']}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    bottom: space[4],
    flexDirection: 'row',
    gap: space[2],
    left: space[4],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    position: 'absolute',
    right: space[4],
    zIndex: 20,
  },
  message: {
    flex: 1,
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
  },
  undoButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
  },
  undoLabel: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.mediumFontWeight,
  },
});
