import { type ReactNode, useState } from 'react';
import { getCalendars } from 'expo-localization';
import { Pressable, StyleSheet, View } from 'react-native';

import { createZonedTimedSchedule, evaluateSchedulePlacement } from '@misyra/domain';
import { radius, space } from '@misyra/design-tokens';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { themeColors, type ColorScheme } from '../design-system/index.js';
import { haptics } from '../experience/native-haptics.js';
import type { CalendarMissionCreateInput } from './calendar-mission-create.js';
import { CalendarMissionFormSheet } from './calendar-mission-form-sheet.js';
import { formatTimelineTime, TimedTimeline } from './calendar-timeline.js';

const SLOT_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;
const TIMELINE_GUTTER = space[10] + space[3];
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CalendarInteractiveTimelineProps = Readonly<{
  colorScheme: ColorScheme;
  initialCurrentMinute: number;
  language?: LocalizationLocale;
  launchMinute: number;
  missionLayer?: ReactNode;
  now: Date;
  onCreateMission?: ((input: CalendarMissionCreateInput) => void | Promise<void>) | undefined;
  scrollHeader?: ReactNode;
  selectedDate: string;
  today: string;
  uses24HourClock?: boolean;
}>;

function localDateTime(localDate: string, minute: number): string {
  if (!LOCAL_DATE_PATTERN.test(localDate)) {
    throw new TypeError('Calendar slot date must use YYYY-MM-DD format.');
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > MINUTES_PER_DAY) {
    throw new RangeError('Calendar slot minute must be within the rendered day.');
  }
  if (minute === MINUTES_PER_DAY) {
    const date = new Date(`${localDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return `${date.toISOString().slice(0, 10)}T00:00:00`;
  }
  const hour = Math.floor(minute / 60);
  const minuteWithinHour = minute % 60;
  return `${localDate}T${String(hour).padStart(2, '0')}:${String(minuteWithinHour).padStart(2, '0')}:00`;
}

function placementForSlot(selectedDate: string, minute: number, now: Date, timeZone: string) {
  const schedule = createZonedTimedSchedule({
    localStart: localDateTime(selectedDate, minute),
    localFinish: localDateTime(selectedDate, minute + SLOT_MINUTES),
    timeZone,
    timeBehavior: 'local_time',
  });
  return evaluateSchedulePlacement({
    targetStartInstant: schedule.startInstant,
    actionInstant: now.toISOString(),
    currentRewardEligibility: 'eligible',
  });
}

function formatSlotTime(
  minute: number,
  language: LocalizationLocale,
  uses24HourClock: boolean,
): string {
  return formatTimelineTime(minute % MINUTES_PER_DAY, language, uses24HourClock);
}

export function CalendarInteractiveTimeline({
  colorScheme,
  initialCurrentMinute,
  language = 'en',
  launchMinute,
  missionLayer,
  now,
  onCreateMission,
  scrollHeader,
  selectedDate,
  today,
  uses24HourClock = true,
}: CalendarInteractiveTimelineProps) {
  const colors = themeColors(colorScheme);
  const catalog = localizationCatalogs[language];
  const missionTimeZone = getCalendars()[0].timeZone ?? 'UTC';
  const [selectedSlotMinute, setSelectedSlotMinute] = useState<number | null>(null);
  const [creationSlotMinute, setCreationSlotMinute] = useState<number | null>(null);

  const clearSelection = () => {
    setSelectedSlotMinute(null);
  };

  const closeCreation = () => {
    setCreationSlotMinute(null);
    setSelectedSlotMinute(null);
  };

  const slotLayer = (
    <View pointerEvents="box-none" style={styles.slotLayer} testID="calendar-slot-layer">
      <Pressable
        accessible={false}
        onPress={clearSelection}
        style={styles.slotClearLayer}
        testID="calendar-slot-clear-layer"
      />
      {Array.from(
        { length: MINUTES_PER_DAY / SLOT_MINUTES },
        (_, index) => index * SLOT_MINUTES,
      ).map((minute) => {
        const placement = placementForSlot(selectedDate, minute, now, missionTimeZone);
        if (!placement.allowed) return null;

        return (
          <Pressable
            accessibilityLabel={catalog['calendar.create.selectSlot'].replace(
              '{time}',
              formatSlotTime(minute, language, uses24HourClock),
            )}
            accessibilityRole="button"
            key={minute}
            onPress={() => {
              if (selectedSlotMinute === minute) {
                setCreationSlotMinute(minute);
                return;
              }
              setCreationSlotMinute(null);
              setSelectedSlotMinute(minute);
              haptics.triggerNonBlocking('timeSlotSelection');
            }}
            style={[styles.slot, { top: minute }]}
            testID={`calendar-slot-${String(minute)}`}
          />
        );
      })}
      {selectedSlotMinute === null ? null : (
        <View
          accessibilityValue={{ now: selectedSlotMinute, min: 0, max: MINUTES_PER_DAY }}
          pointerEvents="none"
          style={[
            styles.selectedSlot,
            {
              borderColor: colors.focusRing,
              top: selectedSlotMinute,
            },
          ]}
          testID="calendar-selected-slot-frame"
        />
      )}
      {missionLayer}
    </View>
  );

  return (
    <>
      <TimedTimeline
        colorScheme={colorScheme}
        initialCurrentMinute={initialCurrentMinute}
        language={language}
        launchMinute={launchMinute}
        missionLayer={slotLayer}
        onScrollBeginDrag={clearSelection}
        scrollHeader={scrollHeader}
        selectedDate={selectedDate}
        today={today}
        uses24HourClock={uses24HourClock}
      />
      {creationSlotMinute === null || onCreateMission === undefined ? null : (
        <CalendarMissionFormSheet
          colorScheme={colorScheme}
          creationSlotMinute={creationSlotMinute}
          language={language}
          now={now}
          onCancel={closeCreation}
          onSubmit={(input) => {
            void Promise.resolve(onCreateMission(input))
              .then(() => {
                haptics.triggerNonBlocking('save');
                closeCreation();
              })
              .catch(() => undefined);
          }}
          selectedDate={selectedDate}
          timeZone={missionTimeZone}
          uses24HourClock={uses24HourClock}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  slotLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  slotClearLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  slot: {
    height: SLOT_MINUTES,
    left: TIMELINE_GUTTER,
    position: 'absolute',
    right: 0,
  },
  selectedSlot: {
    borderRadius: radius.sm,
    borderWidth: 2,
    height: SLOT_MINUTES,
    left: TIMELINE_GUTTER,
    position: 'absolute',
    right: 0,
  },
});
