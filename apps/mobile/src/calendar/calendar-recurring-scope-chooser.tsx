import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { layout, radius, space, typography } from '@misyra/design-tokens';
import type { RecurringSeriesScope } from '@misyra/domain';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { themeColors, type ColorScheme } from '../design-system/index.js';

export type CalendarRecurringScopeOperation = 'edit' | 'delete' | 'restore';

export interface CalendarRecurringScopeChooserProps {
  readonly colorScheme: ColorScheme;
  readonly language: LocalizationLocale;
  readonly operation: CalendarRecurringScopeOperation;
  readonly onCancel: () => void;
  readonly onSelect: (scope: RecurringSeriesScope) => void;
}

const choices: readonly Readonly<{
  scope: RecurringSeriesScope;
  key:
    | 'calendar.recurringScope.thisOccurrence'
    | 'calendar.recurringScope.thisAndFuture'
    | 'calendar.recurringScope.entireSeries';
  testID: string;
}>[] = [
  {
    scope: 'this_occurrence',
    key: 'calendar.recurringScope.thisOccurrence',
    testID: 'recurring-scope-this-occurrence',
  },
  {
    scope: 'this_and_future',
    key: 'calendar.recurringScope.thisAndFuture',
    testID: 'recurring-scope-this-and-future',
  },
  {
    scope: 'entire_series',
    key: 'calendar.recurringScope.entireSeries',
    testID: 'recurring-scope-entire-series',
  },
];

function operationTitleKey(
  operation: CalendarRecurringScopeOperation,
):
  | 'calendar.recurringScope.editTitle'
  | 'calendar.recurringScope.deleteTitle'
  | 'calendar.recurringScope.restoreTitle' {
  switch (operation) {
    case 'edit':
      return 'calendar.recurringScope.editTitle';
    case 'delete':
      return 'calendar.recurringScope.deleteTitle';
    case 'restore':
      return 'calendar.recurringScope.restoreTitle';
  }
}

export function CalendarRecurringScopeChooser({
  colorScheme,
  language,
  operation,
  onCancel,
  onSelect,
}: CalendarRecurringScopeChooserProps) {
  const catalog = localizationCatalogs[language];
  const colors = themeColors(colorScheme);
  const title = catalog[operationTitleKey(operation)];

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel={catalog['calendar.recurringScope.cancel']}
          accessibilityRole="button"
          onPress={onCancel}
          style={styles.backdrop}
          testID="recurring-scope-backdrop"
        />
        <View
          accessibilityLabel={title}
          accessibilityRole="menu"
          style={[styles.sheet, { backgroundColor: colors.canvas, borderColor: colors.border }]}
          testID="recurring-scope-chooser"
        >
          <Text allowFontScaling style={[styles.title, { color: colors.textPrimary }]}>
            {title}
          </Text>
          {choices.map((choice) => (
            <Pressable
              accessibilityLabel={catalog[choice.key]}
              accessibilityRole="menuitem"
              key={choice.scope}
              onPress={() => {
                onSelect(choice.scope);
              }}
              style={[styles.choice, { borderColor: colors.border }]}
              testID={choice.testID}
            >
              <Text allowFontScaling style={[styles.choiceText, { color: colors.textPrimary }]}>
                {catalog[choice.key]}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityLabel={catalog['calendar.recurringScope.cancel']}
            accessibilityRole="button"
            onPress={onCancel}
            style={styles.cancel}
            testID="recurring-scope-cancel"
          >
            <Text allowFontScaling style={[styles.choiceText, { color: colors.primary }]}>
              {catalog['calendar.recurringScope.cancel']}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space[2],
    margin: layout.screenHorizontalPadding,
    padding: space[4],
  },
  title: {
    fontSize: typography.headline.fontSize,
    fontWeight: typography.headline.fontWeight,
    marginBottom: space[1],
  },
  choice: {
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
  },
  choiceText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
  cancel: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
  },
});
