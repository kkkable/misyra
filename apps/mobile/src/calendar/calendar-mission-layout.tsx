import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { layout, radius, space, typography } from '@misyra/design-tokens';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { themeColors, type ColorScheme } from '../design-system/index.js';
import {
  commitMissionAdjustment,
  type AdjustableTimedMission,
  type MissionAdjustmentKind,
  type MissionAdjustmentResult,
} from './calendar-mission-adjustment.js';

const MINUTES_PER_DAY = 24 * 60;
const TIMELINE_GUTTER = space[10] + space[3];
const DIRECT_MANIPULATION_LONG_PRESS_MS = 350;

export type MissionCardStatus = 'unfinished' | 'verified' | 'late' | 'private';

export interface TimedMissionSummary {
  readonly id: string;
  readonly title: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly orderKey: string;
  readonly status: MissionCardStatus;
  readonly rewardEligibility: AdjustableTimedMission['rewardEligibility'];
  readonly timeZone: string;
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

interface MissionColumnAssignment {
  readonly mission: TimedMissionSummary;
  readonly column: number;
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

function assignMissionColumns(missions: readonly TimedMissionSummary[]): {
  readonly assignments: readonly MissionColumnAssignment[];
  readonly peakConcurrency: number;
} {
  const columnEnds: number[] = [];
  const assignments = missions.map((mission) => {
    let column = columnEnds.findIndex((endMinute) => endMinute <= mission.startMinute);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(mission.endMinute);
    } else {
      columnEnds[column] = mission.endMinute;
    }

    return { mission, column };
  });

  return {
    assignments,
    peakConcurrency: columnEnds.length,
  };
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
    const { assignments, peakConcurrency } = assignMissionColumns(groupMissions);
    const visibleColumnCount = peakConcurrency >= 4 ? 2 : peakConcurrency;
    const widthPercent = 100 / visibleColumnCount;
    const visibleAssignments =
      peakConcurrency >= 4
        ? assignments.filter((assignment) => assignment.column < visibleColumnCount)
        : assignments;
    const cards = visibleAssignments.map(({ mission, column }) => ({
      ...missionFrame(mission),
      leftPercent: column * widthPercent,
      mission,
      widthPercent,
    }));
    const hiddenMissions =
      peakConcurrency >= 4
        ? assignments
            .filter((assignment) => assignment.column >= visibleColumnCount)
            .map((assignment) => assignment.mission)
        : [];
    const top = Math.min(...groupMissions.map((mission) => mission.startMinute));
    const bottom = Math.max(...groupMissions.map((mission) => mission.endMinute));

    return {
      id: `overlap-${String(groupIndex)}`,
      cards,
      hiddenMissions,
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

function missionHitSlop(mission: TimedMissionSummary): {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
} {
  const verticalInset = Math.max(0, (layout.minimumTouchTarget - missionFrame(mission).height) / 2);
  return {
    top: verticalInset,
    bottom: verticalInset,
    left: 0,
    right: 0,
  };
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
      hitSlop={missionHitSlop(mission)}
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
  readonly highlightedMissionIds?: readonly string[];
  readonly language: LocalizationLocale;
  readonly missions: readonly TimedMissionSummary[];
  readonly now: Date;
  readonly getNow?: (() => Date) | undefined;
  readonly selectedDate: string;
  readonly selectedMissionId?: string;
  readonly onMissionAdjustment?:
    ((adjustment: MissionAdjustmentResult) => void | Promise<void>) | undefined;
  readonly onMissionPress?: ((mission: TimedMissionSummary) => void) | undefined;
}

function formatMore(language: LocalizationLocale, count: number): string {
  return localizationCatalogs[language]['calendar.allDay.more'].replace('{count}', String(count));
}

function groupList(
  group: MissionOverlapGroup,
  colorScheme: ColorScheme,
  highlightedMissionIds: ReadonlySet<string>,
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
          selected={selectedMissionId === mission.id || highlightedMissionIds.has(mission.id)}
          style={styles.overflowListCard}
          testID={`calendar-overlap-list-mission-${mission.id}`}
        />
      ))}
    </View>
  );
}

function percentageDimension(value: number): `${number}%` {
  return `${String(value)}%` as `${number}%`;
}

function missionPositionStyle(card: MissionCardLayout): ViewStyle {
  return {
    height: card.height,
    left: percentageDimension(card.leftPercent),
    position: 'absolute',
    top: card.top,
    width: percentageDimension(card.widthPercent),
  };
}

function adjustableMission(mission: TimedMissionSummary): AdjustableTimedMission {
  return {
    id: mission.id,
    startMinute: mission.startMinute,
    endMinute: mission.endMinute,
    rewardEligibility: mission.rewardEligibility,
    timeZone: mission.timeZone,
  };
}

interface AdjustableMissionCardProps {
  readonly card: MissionCardLayout;
  readonly colorScheme: ColorScheme;
  readonly getNow: () => Date;
  readonly highlighted: boolean;
  readonly language: LocalizationLocale;
  readonly selected: boolean;
  readonly selectedDate: string;
  readonly onMissionAdjustment?:
    ((adjustment: MissionAdjustmentResult) => void | Promise<void>) | undefined;
  readonly onMissionPress?: ((mission: TimedMissionSummary) => void) | undefined;
}

function AdjustableMissionCard({
  card,
  colorScheme,
  getNow,
  highlighted,
  language,
  selected,
  selectedDate,
  onMissionAdjustment,
  onMissionPress,
}: AdjustableMissionCardProps) {
  const mission = card.mission;
  const colors = themeColors(colorScheme);
  const moveActive = useSharedValue(false);
  const moveTranslationY = useSharedValue(0);
  const resizeActive = useSharedValue(false);
  const resizeTranslationY = useSharedValue(0);
  const committedStartMinute = useSharedValue(mission.startMinute);
  const committedEndMinute = useSharedValue(mission.endMinute);
  const committedRewardEligibility = useSharedValue(mission.rewardEligibility);
  const positionedStyle = missionPositionStyle(card);

  useEffect(() => {
    committedStartMinute.value = mission.startMinute;
    committedEndMinute.value = mission.endMinute;
    committedRewardEligibility.value = mission.rewardEligibility;
  }, [
    committedEndMinute,
    committedRewardEligibility,
    committedStartMinute,
    mission.endMinute,
    mission.rewardEligibility,
    mission.startMinute,
  ]);

  const animatedAdjustmentStyle = useAnimatedStyle(() => {
    const currentStart = committedStartMinute.value;
    const currentEnd = committedEndMinute.value;
    const duration = currentEnd - currentStart;
    if (moveActive.value) {
      const nextStart = Math.min(
        Math.max(currentStart + moveTranslationY.value, 0),
        MINUTES_PER_DAY - duration,
      );
      return { height: duration, top: nextStart };
    }
    if (resizeActive.value) {
      const nextEnd = Math.min(
        Math.max(currentEnd + resizeTranslationY.value, currentStart + 15),
        MINUTES_PER_DAY,
      );
      return { height: nextEnd - currentStart, top: currentStart };
    }
    return { height: duration, top: currentStart };
  });

  const finishAdjustment = (kind: MissionAdjustmentKind, translationY: number) => {
    try {
      const result = commitMissionAdjustment({
        mission: {
          ...adjustableMission(mission),
          startMinute: committedStartMinute.value,
          endMinute: committedEndMinute.value,
          rewardEligibility: committedRewardEligibility.value,
        },
        kind,
        translationY,
        selectedDate,
        now: getNow(),
      });
      if (result.allowed) {
        committedStartMinute.value = result.startMinute;
        committedEndMinute.value = result.endMinute;
        committedRewardEligibility.value = result.rewardEligibility;
      }
      void onMissionAdjustment?.(result);
    } finally {
      if (kind === 'move') {
        moveActive.value = false;
        moveTranslationY.value = 0;
      } else {
        resizeActive.value = false;
        resizeTranslationY.value = 0;
      }
    }
  };

  const resizeGesture = usePanGesture({
    activateAfterLongPress: DIRECT_MANIPULATION_LONG_PRESS_MS,
    onActivate: () => {
      resizeActive.value = true;
    },
    onUpdate: (event) => {
      resizeTranslationY.value = event.translationY;
    },
    onDeactivate: (event) => {
      if (!event.canceled) {
        scheduleOnRN(finishAdjustment, 'resize', event.translationY);
      } else {
        resizeActive.value = false;
        resizeTranslationY.value = 0;
      }
    },
  });

  const moveGesture = usePanGesture({
    activateAfterLongPress: DIRECT_MANIPULATION_LONG_PRESS_MS,
    requireToFail: resizeGesture,
    onActivate: () => {
      moveActive.value = true;
    },
    onUpdate: (event) => {
      moveTranslationY.value = event.translationY;
    },
    onDeactivate: (event) => {
      if (!event.canceled) {
        scheduleOnRN(finishAdjustment, 'move', event.translationY);
      } else {
        moveActive.value = false;
        moveTranslationY.value = 0;
      }
    },
  });

  return (
    <GestureDetector gesture={moveGesture}>
      <Animated.View
        pointerEvents="box-none"
        style={[positionedStyle, animatedAdjustmentStyle]}
        testID={`calendar-mission-move-gesture-${mission.id}`}
      >
        <MissionCard
          colorScheme={colorScheme}
          language={language}
          mission={mission}
          onPress={onMissionPress}
          selected={selected || highlighted}
          style={styles.gestureCard}
        />
        {selected ? (
          <GestureDetector gesture={resizeGesture}>
            <View
              accessibilityLabel={`${mission.title}, resize`}
              accessibilityRole="adjustable"
              style={styles.resizeTouchTarget}
              testID={`calendar-mission-resize-handle-${mission.id}`}
            >
              <View style={[styles.resizeIndicator, { backgroundColor: colors.primary }]} />
            </View>
          </GestureDetector>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

export function TimedMissionLayer({
  colorScheme,
  getNow = () => new Date(),
  highlightedMissionIds = [],
  language,
  missions,
  selectedDate,
  selectedMissionId,
  onMissionAdjustment,
  onMissionPress,
}: TimedMissionLayerProps) {
  const colors = themeColors(colorScheme);
  const groups = buildMissionOverlapGroups(missions);
  const highlightedMissionIdSet = new Set(highlightedMissionIds);
  const notificationExpandedGroupId =
    groups.find((group) =>
      group.hiddenMissions.some((mission) => highlightedMissionIdSet.has(mission.id)),
    )?.id ?? null;
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const effectiveExpandedGroupId = expandedGroupId ?? notificationExpandedGroupId;

  return (
    <View pointerEvents="box-none" style={styles.layer} testID="calendar-timed-mission-layer">
      {groups.map((group) => (
        <View key={group.id} pointerEvents="box-none">
          {group.cards.map((card) =>
            card.mission.status === 'unfinished' ? (
              <AdjustableMissionCard
                card={card}
                colorScheme={colorScheme}
                getNow={getNow}
                highlighted={highlightedMissionIdSet.has(card.mission.id)}
                key={card.mission.id}
                language={language}
                onMissionAdjustment={onMissionAdjustment}
                onMissionPress={onMissionPress}
                selected={selectedMissionId === card.mission.id}
                selectedDate={selectedDate}
              />
            ) : (
              <MissionCard
                colorScheme={colorScheme}
                key={card.mission.id}
                language={language}
                mission={card.mission}
                onPress={onMissionPress}
                selected={
                  selectedMissionId === card.mission.id ||
                  highlightedMissionIdSet.has(card.mission.id)
                }
                style={missionPositionStyle(card)}
              />
            ),
          )}
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
          {effectiveExpandedGroupId === group.id
            ? groupList(
                group,
                colorScheme,
                highlightedMissionIdSet,
                language,
                selectedMissionId,
                onMissionPress,
              )
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
  gestureCard: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  layer: {
    bottom: 0,
    left: TIMELINE_GUTTER,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  moreButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
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
  resizeIndicator: {
    alignSelf: 'center',
    borderRadius: radius.pill,
    height: space[1],
    width: space[6],
  },
  resizeTouchTarget: {
    alignItems: 'center',
    bottom: -layout.minimumTouchTarget / 2,
    height: layout.minimumTouchTarget,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 2,
  },
});
