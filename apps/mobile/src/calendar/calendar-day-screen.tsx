import { useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { getCalendars } from 'expo-localization';
import { useLocalSearchParams } from 'expo-router';

import { layout, radius, space, typography } from '@misyra/design-tokens';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { Screen, themeColors, type ColorScheme } from '../design-system/index.js';
import { AllDayMissionList, type AllDayMissionSummary } from './calendar-all-day.js';
import {
  buildMonthGrid,
  buildSevenDayStrip,
  localDateFromNow,
  minuteOfDay,
  resolveCalendarLaunch,
  resolveInitialCalendarDate,
  resolveResponsiveCalendarLayout,
  shouldShowTodayButton,
} from './calendar-day-shell.js';
import { CalendarInteractiveTimeline } from './calendar-interactive-timeline.js';
import type { CalendarMissionCreateInput } from './calendar-mission-create.js';
import { TimedMissionLayer, type TimedMissionSummary } from './calendar-mission-layout.js';

function parseLocalDateParts(value: string): { year: number; month: number; day: number } {
  const [yearText = '0', monthText = '0', dayText = '0'] = value.split('-');
  return { year: Number(yearText), month: Number(monthText), day: Number(dayText) };
}

function localDateAtMonthOffset(value: string, offset: number): string {
  const { year, month } = parseLocalDateParts(value);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  const nextYear = String(date.getUTCFullYear()).padStart(4, '0');
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}-01`;
}

function dateForFormatting(value: string): Date {
  const { year, month, day } = parseLocalDateParts(value);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function weekdayLabel(value: string, locale: LocalizationLocale): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
    dateForFormatting(value),
  );
}

function fullDateLabel(value: string, locale: LocalizationLocale): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dateForFormatting(value));
}

function monthLabel(value: string, locale: LocalizationLocale): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dateForFormatting(value));
}

export interface CalendarDayScreenProps {
  readonly now?: Date;
  readonly language?: LocalizationLocale;
  readonly firstTimedMissionMinute?: number;
  readonly preservedMinute?: number;
  readonly returningFromBackground?: boolean;
  readonly timedMissionsByDate?: Readonly<Record<string, readonly TimedMissionSummary[]>>;
  readonly allDayMissionsByDate?: Readonly<Record<string, readonly AllDayMissionSummary[]>>;
  readonly onTimedMissionPress?: ((mission: TimedMissionSummary) => void) | undefined;
  readonly onAllDayMissionPress?: ((mission: AllDayMissionSummary) => void) | undefined;
  readonly onCreateMission?: ((input: CalendarMissionCreateInput) => Promise<void>) | undefined;
}

export function CalendarDayScreen({
  now = new Date(),
  language = 'en',
  firstTimedMissionMinute,
  preservedMinute,
  returningFromBackground = false,
  timedMissionsByDate = {},
  allDayMissionsByDate = {},
  onTimedMissionPress,
  onAllDayMissionPress,
  onCreateMission,
}: CalendarDayScreenProps) {
  const params = useLocalSearchParams<{ date?: string | string[] }>();
  const catalog = localizationCatalogs[language];
  const copy = {
    calendar: catalog['calendar.shell.title'],
    today: catalog['calendar.shell.today'],
    level: catalog['calendar.shell.levelPlaceholder'],
    streak: catalog['calendar.shell.streakPlaceholder'],
    chooseDate: catalog['calendar.shell.chooseDate'],
    close: catalog['calendar.shell.close'],
    previousMonth: catalog['calendar.shell.previousMonth'],
    nextMonth: catalog['calendar.shell.nextMonth'],
  } as const;
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const colors = themeColors(colorScheme);
  const width = useWindowDimensions().width;
  const responsive = resolveResponsiveCalendarLayout(width);
  const today = localDateFromNow(now);
  const systemCalendar = getCalendars()[0];
  const regionalFirstWeekday = Number(systemCalendar.firstWeekday);
  const firstWeekday =
    typeof regionalFirstWeekday === 'number' &&
    regionalFirstWeekday >= 1 &&
    regionalFirstWeekday <= 7
      ? regionalFirstWeekday
      : 2;
  const uses24HourClock = systemCalendar.uses24hourClock !== false;

  const initialDateRef = useRef(resolveInitialCalendarDate(params.date, today));
  const [selectedDate, setSelectedDate] = useState(initialDateRef.current);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => initialDateRef.current.slice(0, 7) + '-01');
  const timelineSelectionClearRef = useRef<(() => void) | null>(null);

  const strip = useMemo(
    () => buildSevenDayStrip(selectedDate, firstWeekday),
    [firstWeekday, selectedDate],
  );
  const monthGrid = useMemo(
    () => buildMonthGrid(pickerMonth, firstWeekday),
    [firstWeekday, pickerMonth],
  );
  const selectedTimedMissions = timedMissionsByDate[selectedDate] ?? [];
  const selectedAllDayMissions = allDayMissionsByDate[selectedDate] ?? [];
  const currentMinute = minuteOfDay(now);
  const launch = resolveCalendarLaunch({
    nowMinute: currentMinute,
    firstMissionMinute: firstTimedMissionMinute,
    preservedMinute,
    returningFromBackground,
  });

  const clearTimelineSelection = () => {
    timelineSelectionClearRef.current?.();
  };

  const selectDate = (date: string) => {
    clearTimelineSelection();
    setSelectedDate(date);
    setPickerVisible(false);
  };

  return (
    <Screen scroll={false} testID="calendar-day-screen">
      <View style={styles.shell}>
        <View style={styles.topBar}>
          <View style={styles.summaryRow}>
            <Text allowFontScaling style={[styles.summaryText, { color: colors.textSecondary }]}> 
              {copy.level}
            </Text>
            <Text allowFontScaling style={[styles.summaryText, { color: colors.textSecondary }]}> 
              {copy.streak}
            </Text>
          </View>
          <View style={styles.titleRow}>
            <Pressable
              accessibilityLabel={copy.chooseDate}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                clearTimelineSelection();
                setPickerMonth(selectedDate.slice(0, 7) + '-01');
                setPickerVisible(true);
              }}
              style={({ pressed }) => [
                styles.dateButton,
                { backgroundColor: pressed ? colors.surfaceMuted : colors.surface },
              ]}
              testID="calendar-date-picker-trigger"
            >
              <Text
                allowFontScaling
                numberOfLines={1}
                style={[
                  styles.dateButtonText,
                  { color: colors.textPrimary, fontSize: responsive.titleSize },
                ]}
              >
                {fullDateLabel(selectedDate, language)}
              </Text>
            </Pressable>
            {shouldShowTodayButton(selectedDate, today) ? (
              <Pressable
                accessibilityLabel={copy.today}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => selectDate(today)}
                style={({ pressed }) => [
                  styles.todayButton,
                  { backgroundColor: pressed ? colors.surfaceMuted : colors.surface },
                ]}
                testID="calendar-today-button"
              >
                <Text allowFontScaling style={[styles.todayText, { color: colors.accent }]}> 
                  {copy.today}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View
          accessibilityLabel={copy.calendar}
          style={[styles.weekStrip, { columnGap: responsive.columnGap }]}
          testID="calendar-week-strip"
        >
          {strip.map((day) => (
            <Pressable
              accessibilityLabel={fullDateLabel(day.date, language)}
              accessibilityRole="button"
              accessibilityState={{ selected: day.selected }}
              key={day.date}
              onPress={() => selectDate(day.date)}
              style={({ pressed }) => [
                styles.dayChip,
                {
                  backgroundColor: day.selected
                    ? colors.accentSoft
                    : pressed
                      ? colors.surfaceMuted
                      : 'transparent',
                },
              ]}
            >
              <Text
                allowFontScaling
                style={[
                  styles.weekdayText,
                  { color: day.selected ? colors.primaryText : colors.textSecondary },
                ]}
              >
                {weekdayLabel(day.date, language)}
              </Text>
              <Text
                allowFontScaling
                style={[
                  styles.dayNumberText,
                  { color: day.selected ? colors.primaryText : colors.textPrimary },
                ]}
              >
                {String(parseLocalDateParts(day.date).day)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.dayBody, { borderTopColor: colors.divider }]} testID="calendar-day-body">
        <CalendarInteractiveTimeline
          allDayMissions={selectedAllDayMissions}
          colorScheme={colorScheme}
          initialCurrentMinute={currentMinute}
          language={language}
          launchMinute={launch.minute}
          now={now}
          onAllDayMissionPress={onAllDayMissionPress}
          onCreateMission={onCreateMission}
          onRegisterClearSelection={(clear) => {
            timelineSelectionClearRef.current = clear;
          }}
          onTimedMissionPress={onTimedMissionPress}
          selectedDate={selectedDate}
          timedMissions={selectedTimedMissions}
          today={today}
          uses24HourClock={uses24HourClock}
        />
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
        transparent
        visible={pickerVisible}
      >
        <Pressable
          accessibilityLabel={copy.close}
          accessibilityRole="button"
          onPress={() => setPickerVisible(false)}
          style={styles.modalBackdrop}
          testID="calendar-date-picker-backdrop"
        >
          <Pressable
            accessibilityRole="none"
            onPress={(event) => event.stopPropagation()}
            style={[styles.pickerCard, { backgroundColor: colors.surface }]}
          >
            <View style={styles.pickerHeader}>
              <Pressable
                accessibilityLabel={copy.previousMonth}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setPickerMonth((current) => localDateAtMonthOffset(current, -1))}
                style={styles.pickerNavButton}
              >
                <Text style={[styles.pickerNavText, { color: colors.accent }]}>‹</Text>
              </Pressable>
              <Text
                allowFontScaling
                style={[styles.monthTitle, { color: colors.textPrimary }]}
              >
                {monthLabel(pickerMonth, language)}
              </Text>
              <Pressable
                accessibilityLabel={copy.nextMonth}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setPickerMonth((current) => localDateAtMonthOffset(current, 1))}
                style={styles.pickerNavButton}
              >
                <Text style={[styles.pickerNavText, { color: colors.accent }]}>›</Text>
              </Pressable>
            </View>
            <View style={styles.monthGrid} testID="calendar-month-grid">
              {monthGrid.map((day) => {
                const pickerMonthNumber = parseLocalDateParts(pickerMonth).month;
                const inDisplayedMonth = parseLocalDateParts(day.date).month === pickerMonthNumber;
                return (
                  <Pressable
                    accessibilityLabel={fullDateLabel(day.date, language)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: day.date === selectedDate }}
                    key={day.date}
                    onPress={() => selectDate(day.date)}
                    style={({ pressed }) => [
                      styles.monthDay,
                      {
                        backgroundColor:
                          day.date === selectedDate
                            ? colors.accentSoft
                            : pressed
                              ? colors.surfaceMuted
                              : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      allowFontScaling
                      style={[
                        styles.monthDayText,
                        {
                          color: inDisplayedMonth ? colors.textPrimary : colors.textSecondary,
                        },
                      ]}
                    >
                      {String(parseLocalDateParts(day.date).day)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: space.md,
    paddingTop: space.xs,
  },
  topBar: {
    gap: space.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryText: {
    ...typography.caption,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: layout.minTapTarget,
  },
  dateButton: {
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: layout.minTapTarget,
    paddingHorizontal: space.sm,
  },
  dateButtonText: {
    ...typography.title,
    flexShrink: 1,
  },
  todayButton: {
    alignItems: 'center',
    borderRadius: radius.full,
    justifyContent: 'center',
    minHeight: layout.minTapTarget,
    minWidth: layout.minTapTarget,
    paddingHorizontal: space.sm,
  },
  todayText: {
    ...typography.body,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  dayChip: {
    alignItems: 'center',
    borderRadius: radius.full,
    flex: 1,
    justifyContent: 'center',
    minHeight: layout.minTapTarget,
    minWidth: layout.minTapTarget,
    paddingVertical: space.xs,
  },
  weekdayText: {
    ...typography.caption,
  },
  dayNumberText: {
    ...typography.body,
    fontWeight: '600',
  },
  dayBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flex: 1,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.24)',
    flex: 1,
    justifyContent: 'center',
    padding: space.lg,
  },
  pickerCard: {
    borderRadius: radius.lg,
    maxWidth: 420,
    padding: space.md,
    width: '100%',
  },
  pickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pickerNavButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.minTapTarget,
    minWidth: layout.minTapTarget,
  },
  pickerNavText: {
    fontSize: 28,
  },
  monthTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthDay: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.minTapTarget,
    width: '14.285714%',
  },
  monthDayText: {
    ...typography.body,
  },
});
