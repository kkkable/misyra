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
import { getCalendars, getLocales } from 'expo-localization';
import { useLocalSearchParams } from 'expo-router';

import { layout, radius, space, typography } from '@misyra/design-tokens';

import { Screen, themeColors, type ColorScheme } from '../design-system/index.js';
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
import { TimedTimeline } from './calendar-timeline.js';

const messages = {
  en: {
    calendar: 'Calendar',
    today: 'Today',
    level: 'Level —',
    streak: 'Streak —',
    chooseDate: 'Choose date',
    close: 'Close',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
  },
  'zh-HK': {
    calendar: '日曆',
    today: '今天',
    level: '等級 —',
    streak: '連續 —',
    chooseDate: '選擇日期',
    close: '關閉',
    previousMonth: '上個月',
    nextMonth: '下個月',
  },
} as const;

type SupportedLanguage = keyof typeof messages;

function supportedLanguage(languageTag: string | undefined): SupportedLanguage {
  return languageTag?.toLowerCase().startsWith('zh') === true ? 'zh-HK' : 'en';
}

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

function weekdayLabel(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
    dateForFormatting(value),
  );
}

function fullDateLabel(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    timeZone: 'UTC',
  }).format(dateForFormatting(value));
}

function monthLabel(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dateForFormatting(value));
}

export interface CalendarDayScreenProps {
  readonly now?: Date;
  readonly firstTimedMissionMinute?: number;
  readonly preservedMinute?: number;
  readonly returningFromBackground?: boolean;
}

export function CalendarDayScreen({
  now = new Date(),
  firstTimedMissionMinute,
  preservedMinute,
  returningFromBackground = false,
}: CalendarDayScreenProps) {
  const params = useLocalSearchParams<{ date?: string | string[] }>();
  const locale = getLocales()[0].languageTag;
  const language = supportedLanguage(locale);
  const copy = messages[language];
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const colors = themeColors(colorScheme);
  const width = useWindowDimensions().width;
  const responsive = resolveResponsiveCalendarLayout(width);
  const today = localDateFromNow(now);
  const regionalFirstWeekday = Number(getCalendars()[0].firstWeekday);
  const firstWeekday =
    typeof regionalFirstWeekday === 'number' &&
    regionalFirstWeekday >= 1 &&
    regionalFirstWeekday <= 7
      ? regionalFirstWeekday
      : 2;

  const initialDateRef = useRef(resolveInitialCalendarDate(params.date, today));
  const [selectedDate, setSelectedDate] = useState(initialDateRef.current);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(initialDateRef.current);

  const currentMinute = minuteOfDay(now);
  const launch = useMemo(
    () =>
      resolveCalendarLaunch({
        selectedDate,
        today,
        currentMinute,
        ...(firstTimedMissionMinute === undefined ? {} : { firstTimedMissionMinute }),
        ...(preservedMinute === undefined ? {} : { preservedMinute }),
        returningFromBackground,
      }),
    [
      currentMinute,
      firstTimedMissionMinute,
      preservedMinute,
      returningFromBackground,
      selectedDate,
      today,
    ],
  );
  const strip = useMemo(
    () => buildSevenDayStrip(selectedDate, firstWeekday),
    [firstWeekday, selectedDate],
  );
  const monthDays = useMemo(
    () => buildMonthGrid(pickerMonth, firstWeekday),
    [firstWeekday, pickerMonth],
  );
  const pickerMonthNumber = parseLocalDateParts(pickerMonth).month;

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setPickerMonth(date);
  };

  const openPicker = () => {
    setPickerMonth(selectedDate);
    setPickerVisible(true);
  };

  return (
    <Screen colorScheme={colorScheme} testID="calendar-day-screen">
      <View style={[styles.header, { paddingTop: responsive.compactHeader ? space[2] : space[4] }]}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel={copy.chooseDate}
            accessibilityRole="button"
            onPress={openPicker}
            style={styles.dateHeaderButton}
            testID="calendar-date-picker-trigger"
          >
            <Text
              allowFontScaling
              style={[
                styles.dateHeader,
                {
                  color: colors.textPrimary,
                  fontSize: responsive.compactHeader
                    ? typography.title3.fontSize
                    : typography.title2.fontSize,
                },
              ]}
            >
              {fullDateLabel(selectedDate, locale)}
            </Text>
          </Pressable>
          {shouldShowTodayButton(selectedDate, today) ? (
            <Pressable
              accessibilityLabel={copy.today}
              accessibilityRole="button"
              onPress={() => {
                selectDate(today);
              }}
              style={({ pressed }) => [
                styles.todayButton,
                {
                  backgroundColor: pressed ? colors.primarySoft : colors.surface,
                  borderColor: colors.border,
                },
              ]}
              testID="calendar-today-button"
            >
              <Text allowFontScaling style={[styles.todayLabel, { color: colors.primary }]}>
                {copy.today}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View
          accessibilityLabel={copy.calendar}
          style={styles.weekStrip}
          testID="calendar-week-strip"
        >
          {strip.map((day) => (
            <Pressable
              accessibilityLabel={fullDateLabel(day.date, locale)}
              accessibilityRole="button"
              accessibilityState={{ selected: day.selected }}
              key={day.date}
              onPress={() => {
                selectDate(day.date);
              }}
              style={({ pressed }) => [
                styles.dayCell,
                {
                  backgroundColor: day.selected
                    ? colors.primary
                    : pressed
                      ? colors.primarySoft
                      : colors.canvas,
                  minWidth: layout.minimumTouchTarget,
                },
              ]}
              testID={`calendar-day-${day.date}`}
            >
              <Text
                allowFontScaling
                style={[
                  styles.weekday,
                  { color: day.selected ? colors.primaryText : colors.textSecondary },
                ]}
              >
                {weekdayLabel(day.date, locale)}
              </Text>
              <Text
                allowFontScaling
                style={[
                  styles.dayNumber,
                  { color: day.selected ? colors.primaryText : colors.textPrimary },
                ]}
              >
                {day.dayOfMonth}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.progressRow}>
          <Text allowFontScaling style={[styles.placeholder, { color: colors.textSecondary }]}>
            {copy.level}
          </Text>
          <Text allowFontScaling style={[styles.placeholder, { color: colors.textSecondary }]}>
            {copy.streak}
          </Text>
        </View>
      </View>

      <View
        accessibilityLabel={`${launch.reason}:${String(launch.minute)}`}
        style={[styles.dayBody, { borderTopColor: colors.divider }]}
        testID="calendar-day-body"
      >
        <TimedTimeline
          colorScheme={colorScheme}
          initialCurrentMinute={currentMinute}
          launchMinute={launch.minute}
          selectedDate={selectedDate}
          today={today}
        />
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          setPickerVisible(false);
        }}
        transparent
        visible={pickerVisible}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
          <View
            accessibilityViewIsModal
            style={[styles.picker, { backgroundColor: colors.surfaceRaised }]}
            testID="calendar-date-picker"
          >
            <View style={styles.pickerHeader}>
              <Pressable
                accessibilityLabel={copy.previousMonth}
                accessibilityRole="button"
                onPress={() => {
                  setPickerMonth((value) => localDateAtMonthOffset(value, -1));
                }}
                style={styles.monthNavButton}
                testID="calendar-previous-month"
              >
                <Text style={[styles.monthNavLabel, { color: colors.primary }]}>‹</Text>
              </Pressable>
              <Text
                accessibilityRole="header"
                allowFontScaling
                style={[styles.monthTitle, { color: colors.textPrimary }]}
              >
                {monthLabel(pickerMonth, locale)}
              </Text>
              <Pressable
                accessibilityLabel={copy.nextMonth}
                accessibilityRole="button"
                onPress={() => {
                  setPickerMonth((value) => localDateAtMonthOffset(value, 1));
                }}
                style={styles.monthNavButton}
                testID="calendar-next-month"
              >
                <Text style={[styles.monthNavLabel, { color: colors.primary }]}>›</Text>
              </Pressable>
            </View>

            <View style={styles.monthGrid}>
              {monthDays.map((day) => {
                const inDisplayedMonth = parseLocalDateParts(day.date).month === pickerMonthNumber;
                return (
                  <Pressable
                    accessibilityLabel={fullDateLabel(day.date, locale)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: day.date === selectedDate }}
                    key={day.date}
                    onPress={() => {
                      selectDate(day.date);
                      setPickerVisible(false);
                    }}
                    style={styles.monthDay}
                    testID={`calendar-picker-day-${day.date}`}
                  >
                    <Text
                      allowFontScaling
                      style={[
                        styles.monthDayLabel,
                        {
                          color:
                            day.date === selectedDate
                              ? colors.primary
                              : inDisplayedMonth
                                ? colors.textPrimary
                                : colors.textTertiary,
                        },
                      ]}
                    >
                      {day.dayOfMonth}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityLabel={copy.close}
              accessibilityRole="button"
              onPress={() => {
                setPickerVisible(false);
              }}
              style={styles.closeButton}
              testID="calendar-date-picker-close"
            >
              <Text allowFontScaling style={[styles.closeLabel, { color: colors.primary }]}>
                {copy.close}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space[3],
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[2],
    justifyContent: 'space-between',
  },
  dateHeaderButton: {
    flex: 1,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
  },
  dateHeader: {
    fontWeight: typography.title2.fontWeight,
  },
  todayButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
  },
  todayLabel: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.mediumFontWeight,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCell: {
    alignItems: 'center',
    borderRadius: radius.md,
    gap: space[1],
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingVertical: space[1],
  },
  weekday: {
    fontSize: typography.caption2.fontSize,
    fontWeight: typography.caption2.fontWeight,
  },
  dayNumber: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.mediumFontWeight,
  },
  progressRow: {
    flexDirection: 'row',
    gap: space[4],
  },
  placeholder: {
    fontSize: typography.caption1.fontSize,
    fontWeight: typography.caption1.fontWeight,
  },
  dayBody: {
    borderTopWidth: 1,
    flex: 1,
    marginTop: space[3],
  },
  modalBackdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: space[4],
  },
  picker: {
    borderRadius: radius.lg,
    gap: space[3],
    maxWidth: layout.maximumPhoneWidth,
    padding: space[4],
    width: '100%',
  },
  pickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthNavButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
  },
  monthNavLabel: {
    fontSize: typography.title2.fontSize,
    fontWeight: typography.title2.fontWeight,
  },
  monthTitle: {
    fontSize: typography.headline.fontSize,
    fontWeight: typography.headline.fontWeight,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthDay: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    width: '14.285714%',
  },
  monthDayLabel: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.mediumFontWeight,
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
  },
  closeLabel: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
});
