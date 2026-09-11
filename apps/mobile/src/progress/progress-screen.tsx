import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { layout, radius, space, typography } from '@misyra/design-tokens';
import { calculateLevelProgress } from '@misyra/domain';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { themeColors, type ColorScheme } from '../design-system/contracts.js';
import type { ProgressSnapshot } from '../storage/local-repositories.js';

export type ProgressRecentItem = Readonly<{
  occurrenceId: string;
  title: string;
  completedAt: string;
  awardedXp: number;
}>;

export type ProgressScreenProps = Readonly<{
  colorScheme: ColorScheme;
  language: LocalizationLocale;
  numberLocale: string;
  snapshot: ProgressSnapshot;
  recent: readonly ProgressRecentItem[];
}>;

function formatMessage(source: string, value: string): string {
  return source.replace('{value}', value);
}

function numberFormatter(locale: string, fallback: LocalizationLocale): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale);
  } catch {
    return new Intl.NumberFormat(fallback);
  }
}

export function ProgressScreen({
  colorScheme,
  language,
  numberLocale,
  snapshot,
  recent,
}: ProgressScreenProps) {
  const colors = themeColors(colorScheme);
  const catalog = localizationCatalogs[language];
  const formatNumber = numberFormatter(numberLocale, language).format;
  const level = calculateLevelProgress(snapshot.totalXp);

  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]} testID="progress-screen">
      <ScrollView contentContainerStyle={styles.content}>
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
          {catalog['progress.title']}
        </Text>

        <View
          accessibilityLabel={catalog['progress.title']}
          style={[
            styles.progressCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
          testID="progress-summary-card"
        >
          <Text
            allowFontScaling
            style={[
              styles.level,
              {
                color: colors.textPrimary,
                fontSize: typography.title2.fontSize,
                fontWeight: typography.title2.fontWeight,
              },
            ]}
          >
            {formatMessage(catalog['progress.level'], formatNumber(level.level))}
          </Text>
          <Text
            allowFontScaling
            style={[
              styles.label,
              {
                color: colors.textSecondary,
                fontSize: typography.bodySmall.fontSize,
                fontWeight: typography.bodySmall.fontWeight,
              },
            ]}
          >
            {catalog['progress.xpTowardNext']}
          </Text>
          <Text
            allowFontScaling
            style={[
              styles.xp,
              {
                color: colors.textPrimary,
                fontSize: typography.headline.fontSize,
                fontWeight: typography.headline.fontWeight,
              },
            ]}
          >
            {formatNumber(level.xpIntoLevel)} / {formatNumber(level.xpToNextLevel)} XP
          </Text>

          <View style={styles.metrics}>
            <ProgressMetric
              label={catalog['progress.currentStreak']}
              value={formatNumber(snapshot.currentStreak)}
              colorScheme={colorScheme}
            />
            <ProgressMetric
              label={catalog['progress.longestStreak']}
              value={formatNumber(snapshot.longestStreak)}
              colorScheme={colorScheme}
            />
            <ProgressMetric
              label={catalog['progress.totalCompleted']}
              value={formatNumber(snapshot.totalCompleted)}
              colorScheme={colorScheme}
            />
          </View>
        </View>

        <Text
          accessibilityRole="header"
          allowFontScaling
          style={[
            styles.sectionTitle,
            {
              color: colors.textPrimary,
              fontSize: typography.headline.fontSize,
              fontWeight: typography.headline.fontWeight,
            },
          ]}
        >
          {catalog['progress.recentCompleted']}
        </Text>

        {recent.length === 0 ? (
          <Text
            allowFontScaling
            style={{
              color: colors.textSecondary,
              fontSize: typography.body.fontSize,
              fontWeight: typography.body.fontWeight,
            }}
            testID="progress-empty-recent"
          >
            {catalog['progress.emptyRecent']}
          </Text>
        ) : (
          <View style={styles.recentList} testID="progress-recent-list">
            {recent.map((item) => (
              <View
                key={item.occurrenceId}
                style={[styles.recentRow, { borderBottomColor: colors.divider }]}
              >
                <Text
                  allowFontScaling
                  numberOfLines={2}
                  style={[
                    styles.recentTitle,
                    {
                      color: colors.textPrimary,
                      fontSize: typography.body.fontSize,
                      fontWeight: typography.body.mediumFontWeight,
                    },
                  ]}
                >
                  {item.title}
                </Text>
                <Text
                  allowFontScaling
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.bodySmall.fontSize,
                    fontWeight: typography.bodySmall.mediumFontWeight,
                  }}
                >
                  +{formatNumber(item.awardedXp)} XP
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ProgressMetric({
  label,
  value,
  colorScheme,
}: Readonly<{ label: string; value: string; colorScheme: ColorScheme }>) {
  const colors = themeColors(colorScheme);
  return (
    <View style={styles.metric}>
      <Text
        allowFontScaling
        style={{
          color: colors.textSecondary,
          fontSize: typography.caption1.fontSize,
          fontWeight: typography.caption1.fontWeight,
        }}
      >
        {label}
      </Text>
      <Text
        allowFontScaling
        style={{
          color: colors.textPrimary,
          fontSize: typography.headline.fontSize,
          fontWeight: typography.headline.fontWeight,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenHorizontalPadding,
    paddingTop: space[6],
    paddingBottom: space[12],
    gap: space[4],
  },
  title: {
    marginBottom: space[2],
  },
  progressCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space[5],
    gap: space[2],
  },
  level: {
    marginBottom: space[1],
  },
  label: {},
  xp: {
    marginBottom: space[3],
  },
  metrics: {
    gap: space[3],
  },
  metric: {
    gap: space[1],
  },
  sectionTitle: {
    marginTop: space[2],
  },
  recentList: {
    gap: 0,
  },
  recentRow: {
    minHeight: 44,
    borderBottomWidth: 1,
    paddingVertical: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
  },
  recentTitle: {
    flex: 1,
  },
});
