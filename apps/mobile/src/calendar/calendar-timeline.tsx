import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { space, typography } from '@misyra/design-tokens';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

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

export function formatTimelineTime(
  minute: number,
  language: LocalizationLocale = 'en',
  uses24HourClock = true,
): string {
  assertMinuteInRenderedDay(minute);
  const hour = Math.floor(minute / 60) % 24;
  const minuteWithinHour = minute % 60;

  if (uses24HourClock) {
    return `${String(hour).padStart(2, '0')}:${String(minuteWithinHour).padStart(2, '0')}`;
  }

  const date = new Date(Date.UTC(2000, 0, 1, hour, minuteWithinHour));
  return new Intl.DateTimeFormat(language, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(date);
}

export function buildTimelineGuides(
  language: LocalizationLocale = 'en',
  uses24HourClock = true,
): readonly TimelineGuide[] {
  return Array.from({ length: MINUTES_PER_DAY / GUIDE_MINUTES }, (_, index) => {
    const minute = index * GUIDE_MINUTES;
    const guide: TimelineGuide = {
      minute,
      y: timelineYForMinute(minute),
    };

    return minute % 60 === 0
      ? { ...guide, label: formatTimelineTime(minute, language, uses24HourClock) }
      : guide;
  });
}

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
  readonly language?: LocalizationLocale;
  readonly uses24HourClock?: boolean;
  readonly nowProvider?: () => Date;
  readonly updateIntervalMs?: number;
}

export function CurrentTimeRuler({
  colorScheme,
  initialMinute,
  language = 'en',
  uses24HourClock = true,
  nowProvider = systemNowProvider,
  updateIntervalMs = DEFAULT_RULER_UPDATE_INTERVAL_MS,
}: CurrentTimeRulerProps) {
  assertMinuteInRenderedDay(initialMinute);
  const [minute, setMinute] = useState(initialMinute);
  const colors = themeColors(colorScheme);
  const currentTimeLabel = localizationCatalogs[language]['calendar.timeline.currentTime'].replace(
    '{time}',
    formatTimelineTime(minute, language, uses24HourClock),
  );

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
      accessibilityLabel={currentTimeLabel}
      accessible
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
  readonly language?: LocalizationLocale;
  readonly launchMinute: number;
  readonly missionLayer?: ReactNode;
  readonly scrollHeader?: ReactNode;
  readonly selectedDate: string;
  readonly today: string;
  readonly uses24HourClock?: boolean;
}

export function TimedTimeline({
  colorScheme,
  initialCurrentMinute,
  language = 'en',
  launchMinute,
  missionLayer,
  scrollHeader,
  selectedDate,
  today,
  uses24HourClock = true,
}: TimedTimelineProps) {
  const colors = themeColors(colorScheme);
  const scrollRef = useRef<ScrollView>(null);
  const initialHeaderPositionApplied = useRef(false);
  const launchOffset = timelineLaunchOffset(launchMinute);
  const hasScrollHeader = scrollHeader !== undefined && scrollHeader !== null;
  const timelineGuides = useMemo(
    () => buildTimelineGuides(language, uses24HourClock),
    [language, uses24HourClock],
  );

  return (
    <ScrollView
      contentOffset={{ x: 0, y: hasScrollHeader ? 0 : launchOffset }}
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      style={styles.scroll}
      testID="calendar-timeline-scroll"
    >
      {hasScrollHeader ? (
        <View
          onLayout={(event) => {
            if (initialHeaderPositionApplied.current) {
              return;
            }
            initialHeaderPositionApplied.current = true;
            scrollRef.current?.scrollTo({
              animated: false,
              x: 0,
              y: event.nativeEvent.layout.height + launchOffset,
            });
          }}
          testID="calendar-scroll-header"
        >
          {scrollHeader}
        </View>
      ) : null}
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
        {missionLayer}
        {selectedDate === today ? (
          <CurrentTimeRuler
            colorScheme={colorScheme}
            initialMinute={initialCurrentMinute}
            language={language}
            uses24HourClock={uses24HourClock}
          />
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
