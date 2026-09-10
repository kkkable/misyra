import { StyleSheet, Text, View } from 'react-native';

import { radius, space, typography } from '@misyra/design-tokens';
import { appTimeZoneUpdatedMessage, type LocalizationLocale } from '@misyra/localization';

import { themeColors, type ColorScheme } from '../design-system/index.js';

type AppTimeZoneNoticeProps = Readonly<{
  colorScheme: ColorScheme;
  language: LocalizationLocale;
  timeZone: string;
}>;

export function AppTimeZoneNotice({ colorScheme, language, timeZone }: AppTimeZoneNoticeProps) {
  const colors = themeColors(colorScheme);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
      ]}
      testID="app-time-zone-change-notice"
    >
      <Text allowFontScaling style={[styles.message, { color: colors.textPrimary }]}>
        {appTimeZoneUpdatedMessage(language, timeZone)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    left: space[4],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    position: 'absolute',
    right: space[4],
    top: space[4],
    zIndex: 30,
  },
  message: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
  },
});
