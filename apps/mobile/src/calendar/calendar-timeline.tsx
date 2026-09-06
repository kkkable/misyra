import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { space, typography } from '@misyra/design-tokens';

import { themeColors, type ColorScheme } from '../design-system/index.js';

const MINUTES_PER_DAY = 24 * 60;
const GUIDE_MINUTES = 30;
const EARLIER_CONTEXT_MINUTES = 30;
const PIXELS_PER_MINUTE = 1;
const DEFAULT_RULER_UPDATE_INTERVAL_MS = 60_000;

export const TIMELINE_HEIGHT = MINUTES_PER_DAY * PIXELS_PER_MINUTE;

export interface TimelineGuide {
  readonly minute: number;
  readonly y: number;
  readonly label?: string;
}

export interface TimelineFrame {
  readonly top: number;
  readonly height: number;
}

function assertMinuteInRenderedDay(minute: number): void {
  if (!Number.isInteger(minute) || minute < 0 || minute > MINUTES_PER_DAY) {
    throw new RangeError('Timeline minute must be an integer inside the rendered day.');
  }
}

export function timelineYForMinute(minute: number): number {
  assertMinuteInRenderedDay(minute);
  return minute * PIXELS_PER_MINUTE;
}

export function timelineFrameForInterval(startMinute: number, endMinute: number): TimelineFrame {
  assertMinuteInRenderedDay(startMinute);
  assertMinuteInRenderedDay(endMinute);
  if (endMinute <= startMinute) {
    throw new RangeError('Timeline interval end must be after its start.');
  }

  return {
    top: timelineYForMinute(startMinute),
    height: (endMinute - startMinute) * PIXELS_PER_MINUTE,
  };
}

function hourLabel(minute: number): string {
  return `${String(minute / 60).padStart(2, '0')}:00`;
}

export function buildTimelineGuides(): readonly TimelineGuide[] {
  return Array.from({ length: MINUTES_PER_DAY / GUIDE_MINUTES }, (_, index) => {
    const minute = index * GUIDE_MINUTES;
    const guide: TimelineGuide = {
      minute,
      y: timelineYForMinute(minute),
    };

    return minute % 60 === 0 ? { ...guide, label: hourLabel(minute) } : guide;
  });
}

const timelineGuides = buildTimelineGuides();

function minuteOfDate(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function timelineLaunchOffset(launchMinute: number): number {
  assertMinuteInRenderedDay(launchMinute);
  return Math.max(
    0,
    Math.min(TIMELINE_HEIGHT, timelineYForMinute(launchMinute) - EARLIER_CONTEXT_MINUTES),
  );
}

const systemNowProvider = (): Date => new Date();

interface CurrentTimeRulerProps {
  readonly colorScheme: ColorScheme;
  readonly initialMinute: number;
  readonly nowProvider?: () => Date;
  readonly updateIntervalMs?: number;
}

export function CurrentTimeRuler({
  colorScheme,
  initialMinute,
  nowProvider = systemNowProvider,
  updateIntervalMs = DEFAULT_RULER_UPDATE_INTERVAL_MS,
}: CurrentTimeRulerProps) {
  assertMinuteInRenderedDay(initialMinute);
  const [minute, setMinute] = useState(initialMinute);
  const colors = themeColors(colorScheme);

  useEffect(() => {
    const interval = setInterval(() => {
      setMinute(minuteOfDate(nowProvider()));
    }, updateIntervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [nowProvider, updateIntervalMs]);

  return (
    <View
      accessibilityLabel={`current-time:${String(minute)}`}
      pointerEvents="none"
      style={[
        styles.currentTimeRuler,
        {
          backgroundColor: colors.primary,
          top: timelineYForMinute(minute),
        },
      ]}
      testID="calendar-current-time-ruler"
    />
  );
}

interface TimedTimelineProps {
  readonly colorScheme: ColorScheme;
  readonly initialCurrentMinute: number;
  readonly launchMinute: number;
  readonly selectedDate: string;
  readonly today: string;
}

export function TimedTimeline({
  colorScheme,
  initialCurrentMinute,
  launchMinute,
  selectedDate,
  today,
}: TimedTimelineProps) {
  const colors = themeColors(colorScheme);

  return (
    <ScrollView
      contentOffset={{ x: 0, y: timelineLaunchOffset(launchMinute) }}
      showsVerticalScrollIndicator={false}
      style={styles.scroll}
      testID="calendar-timeline-scroll"
    >
      <View
        style={[styles.timelineContent, { height: TIMELINE_HEIGHT }]}
        testID="calendar-timeline-content"
      >
        {timelineGuides.map((guide) => (
          <View
            key={`guide-${String(guide.minute)}`}
            pointerEvents="none"
            style={[
              styles.guide,
              {
                borderColor: colors.divider,
                top: guide.y,
              },
            ]}
            testID={`calendar-time-guide-${String(guide.minute)}`}
          />
        ))}
        {timelineGuides.map((guide) =>
          guide.label === undefined ? null : (
            <Text
              allowFontScaling
              key={`label-${String(guide.minute)}`}
              pointerEvents="none"
              style={[
                styles.hourLabel,
                {
                  color: colors.textSecondary,
                  top: guide.y,
                },
              ]}
              testID={`calendar-hour-label-${String(guide.minute)}`}
            >
              {guide.label}
            </Text>
          ),
        )}
        {selectedDate === today ? (
          <CurrentTimeRuler colorScheme={colorScheme} initialMinute={initialCurrentMinute} />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  currentTimeRuler: {
    height: 2,
    left: space[10] + space[3],
    position: 'absolute',
    right: 0,
  },
  guide: {
    borderTopWidth: 1,
    left: space[10] + space[3],
    position: 'absolute',
    right: 0,
  },
  hourLabel: {
    fontSize: typography.caption1.fontSize,
    fontWeight: typography.caption1.fontWeight,
    left: 0,
    position: 'absolute',
  },
  scroll: {
    flex: 1,
  },
  timelineContent: {
    position: 'relative',
  },
});
