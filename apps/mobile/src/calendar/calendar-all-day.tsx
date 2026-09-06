import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getLocales } from 'expo-localization';

import { layout, radius, space, typography } from '@misyra/design-tokens';

import { themeColors, type ColorScheme } from '../design-system/index.js';

const COLLAPSED_CARD_LIMIT = 3;

export interface AllDayMissionSummary {
  readonly id: string;
  readonly title: string;
  readonly orderKey: string;
  readonly completed: boolean;
}

export interface AllDayMissionProjection {
  readonly missions: readonly AllDayMissionSummary[];
  readonly hiddenCount: number;
}

function compareStableText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function orderAllDayMissions(
  missions: readonly AllDayMissionSummary[],
): readonly AllDayMissionSummary[] {
  return [...missions].sort((left, right) => {
    const keyOrder = compareStableText(left.orderKey, right.orderKey);
    return keyOrder === 0 ? compareStableText(left.id, right.id) : keyOrder;
  });
}

export function visibleAllDayMissions(
  missions: readonly AllDayMissionSummary[],
  expanded: boolean,
): AllDayMissionProjection {
  const ordered = orderAllDayMissions(missions);
  if (expanded || ordered.length <= COLLAPSED_CARD_LIMIT) {
    return { missions: ordered, hiddenCount: 0 };
  }

  return {
    missions: ordered.slice(0, COLLAPSED_CARD_LIMIT),
    hiddenCount: ordered.length - COLLAPSED_CARD_LIMIT,
  };
}

function hiddenCountLabel(hiddenCount: number): string {
  const languageTag = getLocales()[0]?.languageTag.toLowerCase() ?? 'en';
  return languageTag.startsWith('zh')
    ? `另外 ${String(hiddenCount)} 項`
    : `+${String(hiddenCount)} more`;
}

interface AllDayMissionListProps {
  readonly colorScheme: ColorScheme;
  readonly missions: readonly AllDayMissionSummary[];
  readonly onMissionPress?: (mission: AllDayMissionSummary) => void;
  readonly selectedDate: string;
}

export function AllDayMissionList({
  colorScheme,
  missions,
  onMissionPress,
  selectedDate,
}: AllDayMissionListProps) {
  const colors = themeColors(colorScheme);
  const [expandedDate, setExpandedDate] = useState<string>();
  const projection = visibleAllDayMissions(missions, expandedDate === selectedDate);

  if (missions.length === 0) {
    return null;
  }

  const moreLabel = hiddenCountLabel(projection.hiddenCount);

  return (
    <View style={styles.container} testID="calendar-all-day-list">
      {projection.missions.map((mission) => (
        <Pressable
          accessibilityLabel={mission.title}
          accessibilityRole="button"
          key={mission.id}
          onPress={() => {
            onMissionPress?.(mission);
          }}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: pressed ? colors.primarySoft : colors.surface,
              borderColor: colors.border,
              minHeight: layout.minimumTouchTarget,
            },
          ]}
          testID={`calendar-all-day-mission-${mission.id}`}
        >
          <Text allowFontScaling style={[styles.title, { color: colors.textPrimary }]}>
            {mission.title}
          </Text>
        </Pressable>
      ))}

      {projection.hiddenCount > 0 ? (
        <Pressable
          accessibilityLabel={moreLabel}
          accessibilityRole="button"
          onPress={() => {
            setExpandedDate(selectedDate);
          }}
          style={({ pressed }) => [
            styles.moreButton,
            {
              backgroundColor: pressed ? colors.primarySoft : colors.canvas,
              minHeight: layout.minimumTouchTarget,
            },
          ]}
          testID="calendar-all-day-more"
        >
          <Text allowFontScaling style={[styles.moreLabel, { color: colors.primary }]}>
            {moreLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  container: {
    gap: space[1],
    paddingBottom: space[2],
    paddingHorizontal: space[4],
    paddingTop: space[2],
  },
  moreButton: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: space[3],
  },
  moreLabel: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
  },
  title: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
  },
});
