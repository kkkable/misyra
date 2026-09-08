import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { layout, radius, space, typography } from '@misyra/design-tokens';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { BottomSheet, themeColors, type ColorScheme } from '../design-system/index.js';

const SWIPE_DISMISS_DISTANCE = 48;

export interface CalendarHelpSheetProps {
  readonly visible: boolean;
  readonly colorScheme: ColorScheme;
  readonly language: LocalizationLocale;
  readonly onDismiss: () => void;
  readonly onFaqPress: () => void;
}

export function CalendarHelpSheet({
  visible,
  colorScheme,
  language,
  onDismiss,
  onFaqPress,
}: CalendarHelpSheetProps) {
  const catalog = localizationCatalogs[language];
  const colors = themeColors(colorScheme);
  const swipeStartY = useRef<number | null>(null);

  const beginSwipe = (event: GestureResponderEvent) => {
    swipeStartY.current = event.nativeEvent.pageY;
  };

  const finishSwipe = (event: GestureResponderEvent) => {
    const start = swipeStartY.current;
    swipeStartY.current = null;
    if (start !== null && event.nativeEvent.pageY - start >= SWIPE_DISMISS_DISTANCE) {
      onDismiss();
    }
  };

  if (!visible) return null;

  return (
    <BottomSheet
      accessibilityLabel={catalog['calendar.help.title']}
      colorScheme={colorScheme}
      dismissAccessibilityLabel={catalog['calendar.help.dismiss']}
      onDismiss={onDismiss}
      testID="calendar-help-sheet"
      visible
    >
      <View
        accessibilityLabel={catalog['calendar.help.swipeToDismiss']}
        accessible
        onTouchCancel={() => {
          swipeStartY.current = null;
        }}
        onTouchEnd={finishSwipe}
        onTouchStart={beginSwipe}
        style={styles.swipeTarget}
        testID="calendar-help-swipe-handle"
      >
        <View style={[styles.swipeHandle, { backgroundColor: colors.border }]} />
      </View>

      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          allowFontScaling
          style={[styles.title, { color: colors.textPrimary }]}
        >
          {catalog['calendar.help.title']}
        </Text>
        <Pressable
          accessibilityLabel={catalog['calendar.shell.close']}
          accessibilityRole="button"
          onPress={onDismiss}
          style={styles.closeButton}
          testID="calendar-help-close"
        >
          <Text allowFontScaling style={[styles.actionText, { color: colors.primary }]}> 
            {catalog['calendar.shell.close']}
          </Text>
        </Pressable>
      </View>

      <Text allowFontScaling style={[styles.body, { color: colors.textSecondary }]}> 
        {catalog['calendar.help.body']}
      </Text>

      <View style={styles.statusList}>
        {[
          ['calendar.help.unfinished', colors.border],
          ['calendar.help.verified', colors.verified],
          ['calendar.help.late', colors.late],
          ['calendar.help.private', colors.privateState],
        ].map(([key, swatch]) => (
          <View key={key} style={styles.statusRow}>
            <View style={[styles.swatch, { backgroundColor: swatch }]} />
            <Text allowFontScaling style={[styles.statusText, { color: colors.textPrimary }]}> 
              {catalog[key as keyof typeof catalog]}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.guideList}>
        {[
          'calendar.help.recurring',
          'calendar.help.gestures',
          'calendar.help.completionTiming',
        ].map((key) => (
          <Text
            allowFontScaling
            key={key}
            style={[styles.guideText, { color: colors.textPrimary }]}
          >
            {catalog[key as keyof typeof catalog]}
          </Text>
        ))}
      </View>

      <Pressable
        accessibilityLabel={catalog['calendar.help.faq']}
        accessibilityRole="link"
        onPress={onFaqPress}
        style={({ pressed }) => [
          styles.faqButton,
          { backgroundColor: pressed ? colors.primarySoft : colors.surfaceMuted },
        ]}
        testID="calendar-help-faq"
      >
        <Text allowFontScaling style={[styles.actionText, { color: colors.primary }]}> 
          {catalog['calendar.help.faq']}
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  swipeTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
  },
  swipeHandle: {
    borderRadius: radius.pill,
    height: 4,
    width: 44,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    fontSize: typography.title3.fontSize,
    fontWeight: typography.title3.fontWeight,
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
  },
  body: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
  },
  statusList: {
    gap: space[2],
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[2],
    minHeight: layout.minimumTouchTarget,
  },
  swatch: {
    borderRadius: radius.sm,
    height: 20,
    width: 20,
  },
  statusText: {
    flex: 1,
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
  },
  guideList: {
    gap: space[2],
  },
  guideText: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
  },
  faqButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
  },
  actionText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
});
