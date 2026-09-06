import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { layout, radius, space, typography } from '@misyra/design-tokens';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { themeColors, type ColorScheme } from '../design-system/index.js';

const MINUTES_PER_DAY = 24 * 60;
const TIMELINE_GUTTER = space[10] + space[3];

export type MissionCardStatus = 'unfinished' | 'verified' | 'late' | 'private';

export interface TimedMissionSummary {
  readonly id: string;
  readonly title: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly orderKey: string;
  readonly status: MissionCardStatus;
}

export interface MissionCardLayout {
  readonly mission: TimedMissionSummary;
  readonly top: number;
  readonly height: number;
  readonly leftPercent: number;
  readonly widthPercent: number;
}

export interface MissionOverlapGroup {
  readonly id: string;
  readonly cards: readonly MissionCardLayout[];
  readonly hiddenMissions: readonly TimedMissionSummary[];
  readonly missions: readonly TimedMissionSummary[];
  readonly top: number;
  readonly height: number;
}

function missionFrame(mission: TimedMissionSummary): {
  readonly top: number;
  readonly height: number;
} {
  const { startMinute, endMinute } = mission;
  if (
    !Number.isInteger(startMinute) ||
    !Number.isInteger(endMinute) ||
    startMinute < 0 ||
    startMinute >= MINUTES_PER_DAY ||
    endMinute <= startMinute ||
    endMinute > MINUTES_PER_DAY
  ) {
    throw new RangeError('Timed mission must fit inside one rendered day.');
  }

  return {
    top: startMinute,
    height: endMinute - startMinute,
  };
}

function compareStableText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function compareMissions(left: TimedMissionSummary, right: TimedMissionSummary): number {
  if (left.startMinute !== right.startMinute) {
    return left.startMinute - right.startMinute;
  }

  const order = compareStableText(left.orderKey, right.orderKey);
  return order === 0 ? compareStableText(left.id, right.id) : order;
}

export function buildMissionOverlapGroups(
  missions: readonly TimedMissionSummary[],
): readonly MissionOverlapGroup[] {
  const sorted = [...missions].sort(compareMissions);
  const clusters: TimedMissionSummary[][] = [];
  let cluster: TimedMissionSummary[] = [];
  let clusterEnd = -1;

  for (const mission of sorted) {
    missionFrame(mission);
    if (cluster.length > 0 && mission.startMinute >= clusterEnd) {
      clusters.push(cluster);
      cluster = [];
      clusterEnd = -1;
    }

    cluster.push(mission);
    clusterEnd = Math.max(clusterEnd, mission.endMinute);
  }

  if (cluster.length > 0) {
    clusters.push(cluster);
  }

  return clusters.map((groupMissions, groupIndex) => {
    const visibleCount = groupMissions.length >= 4 ? 2 : groupMissions.length;
    const widthPercent = 100 / visibleCount;
    const cards = groupMissions.slice(0, visibleCount).map((mission, index) => ({
      ...missionFrame(mission),
      leftPercent: index * widthPercent,
      mission,
      widthPercent,
    }));
    const top = Math.min(...groupMissions.map((mission) => mission.startMinute));
    const bottom = Math.max(...groupMissions.map((mission) => mission.endMinute));

    return {
      id: `overlap-${String(groupIndex)}`,
      cards,
      hiddenMissions: groupMissions.length >= 4 ? groupMissions.slice(2) : [],
      missions: groupMissions,
      top,
      height: bottom - top,
    };
  });
}

export function missionCardPalette(status: MissionCardStatus, colorScheme: ColorScheme) {
  const colors = themeColors(colorScheme);
  switch (status) {
    case 'verified':
      return { backgroundColor: colors.verifiedSoft, borderColor: colors.verified } as const;
    case 'late':
      return { backgroundColor: colors.lateSoft, borderColor: colors.late } as const;
    case 'private':
      return { backgroundColor: colors.privateSoft, borderColor: colors.privateState } as const;
    default:
      return { backgroundColor: 'transparent', borderColor: colors.border } as const;
  }
}

function statusLabel(status: MissionCardStatus, language: LocalizationLocale): string {
  const catalog = localizationCatalogs[language];
  switch (status) {
    case 'verified':
      return catalog['calendar.mission.status.verified'];
    case 'late':
      return catalog['calendar.mission.status.late'];
    case 'private':
      return catalog['calendar.mission.status.private'];
    default:
      return catalog['calendar.mission.status.unfinished'];
  }
}

function accessibilityLabel(mission: TimedMissionSummary, language: LocalizationLocale): string {
  return `${mission.title}, ${statusLabel(mission.status, language)}`;
}

interface MissionCardProps {
  readonly colorScheme: ColorScheme;
  readonly language: LocalizationLocale;
  readonly mission: TimedMissionSummary;
  readonly selected: boolean;
  readonly onPress?: ((mission: TimedMissionSummary) => void) | undefined;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function MissionCard({
  colorScheme,
  language,
  mission,
  selected,
  onPress,
  style,
  testID = `calendar-mission-card-${mission.id}`,
}: MissionCardProps) {
  const colors = themeColors(colorScheme);
  const palette = missionCardPalette(mission.status, colorScheme);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel(mission, language)}
      accessibilityRole="button"
      hitSlop={space[2]}
      onPress={() => {
        onPress?.(mission);
      }}
      style={[
        styles.card,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: selected ? colors.focusRing : palette.borderColor,
          borderWidth: selected ? 2 : 1,
        },
        style,
      ]}
      testID={testID}
    >
      <Text
        allowFontScaling
        numberOfLines={2}
        style={[styles.cardTitle, { color: colors.textPrimary }]}
      >
        {mission.title}
      </Text>
    </Pressable>
  );
}

interface TimedMissionLayerProps {
  readonly colorScheme: ColorScheme;
  readonly language: LocalizationLocale;
  readonly missions: readonly TimedMissionSummary[];
  readonly selectedMissionId?: string;
  readonly onMissionPress?: ((mission: TimedMissionSummary) => void) | undefined;
}

function formatMore(language: LocalizationLocale, count: number): string {
  return localizationCatalogs[language]['calendar.allDay.more'].replace('{count}', String(count));
}

function groupList(
  group: MissionOverlapGroup,
  colorScheme: ColorScheme,
  language: LocalizationLocale,
  selectedMissionId: string | undefined,
  onMissionPress: ((mission: TimedMissionSummary) => void) | undefined,
): ReactNode {
  const colors = themeColors(colorScheme);
  return (
    <View
      style={[
        styles.overflowList,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          top: group.top,
        },
      ]}
      testID={`calendar-overlap-list-${group.id}`}
    >
      {group.missions.map((mission) => (
        <MissionCard
          colorScheme={colorScheme}
          key={mission.id}
          language={language}
          mission={mission}
          onPress={onMissionPress}
          selected={selectedMissionId === mission.id}
          style={styles.overflowListCard}
          testID={`calendar-overlap-list-mission-${mission.id}`}
        />
      ))}
    </View>
  );
}

function missionPositionStyle(card: MissionCardLayout): ViewStyle {
  return {
    height: card.height,
    left: `${String(card.leftPercent)}%`,
    position: 'absolute',
    top: card.top,
    width: `${String(card.widthPercent)}%`,
  };
}

export function TimedMissionLayer({
  colorScheme,
  language,
  missions,
  selectedMissionId,
  onMissionPress,
}: TimedMissionLayerProps) {
  const colors = themeColors(colorScheme);
  const groups = buildMissionOverlapGroups(missions);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  return (
    <View pointerEvents="box-none" style={styles.layer} testID="calendar-timed-mission-layer">
      {groups.map((group) => (
        <View key={group.id} pointerEvents="box-none">
          {group.cards.map((card) => (
            <MissionCard
              colorScheme={colorScheme}
              key={card.mission.id}
              language={language}
              mission={card.mission}
              onPress={onMissionPress}
              selected={selectedMissionId === card.mission.id}
              style={missionPositionStyle(card)}
            />
          ))}
          {group.hiddenMissions.length > 0 ? (
            <Pressable
              accessibilityLabel={formatMore(language, group.hiddenMissions.length)}
              accessibilityRole="button"
              onPress={() => {
                setExpandedGroupId((current) => (current === group.id ? null : group.id));
              }}
              style={[
                styles.moreButton,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.border,
                  top: group.top + space[1],
                },
              ]}
              testID={`calendar-overlap-more-${group.id}`}
            >
              <Text allowFontScaling style={[styles.moreText, { color: colors.textPrimary }]}>
                {formatMore(language, group.hiddenMissions.length)}
              </Text>
            </Pressable>
          ) : null}
          {expandedGroupId === group.id
            ? groupList(group, colorScheme, language, selectedMissionId, onMissionPress)
            : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
  cardTitle: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
  },
  layer: {
    bottom: 0,
    left: TIMELINE_GUTTER,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  moreButton: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    position: 'absolute',
    right: space[1],
    zIndex: 3,
  },
  moreText: {
    fontSize: typography.caption1.fontSize,
    fontWeight: typography.caption1.fontWeight,
  },
  overflowList: {
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space[1],
    left: 0,
    padding: space[2],
    position: 'absolute',
    right: 0,
    zIndex: 4,
  },
  overflowListCard: {
    minHeight: layout.minimumTouchTarget,
    position: 'relative',
  },
});
