import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { layout, radius, space, typography } from '@misyra/design-tokens';
import type { MissionRecurrence, RecurrenceEnd, RecurrencePattern } from '@misyra/domain';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { themeColors, type ColorScheme } from '../design-system/index.js';

type Preset = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
type MonthlyMode = 'date' | 'ordinal';
type YearlyMode = 'date' | 'ordinal';
type CustomFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
type EndMode = RecurrenceEnd['type'];
type Ordinal = 1 | 2 | 3 | 4 | -1;

interface CalendarRecurrenceEditorProps {
  readonly colorScheme: ColorScheme;
  readonly initialRecurrence: MissionRecurrence | null;
  readonly language: LocalizationLocale;
  readonly onCancel: () => void;
  readonly onDone: (recurrence: MissionRecurrence | null) => void;
  readonly selectedDate: string;
}

type EditorCopy = Readonly<{
  sameDate: string;
  ordinalWeekday: string;
  interval: string;
  daily: string;
  weekly: string;
  monthly: string;
  yearly: string;
  first: string;
  second: string;
  third: string;
  fourth: string;
  last: string;
}>;

const editorCopy: Readonly<Record<LocalizationLocale, EditorCopy>> = {
  en: {
    sameDate: 'Same date',
    ordinalWeekday: 'Ordinal weekday',
    interval: 'Interval',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    yearly: 'Yearly',
    first: 'First',
    second: 'Second',
    third: 'Third',
    fourth: 'Fourth',
    last: 'Last',
  },
  'zh-HK': {
    sameDate: '同一日期',
    ordinalWeekday: '第幾個星期幾',
    interval: '間隔',
    daily: '每日',
    weekly: '每週',
    monthly: '每月',
    yearly: '每年',
    first: '第一個',
    second: '第二個',
    third: '第三個',
    fourth: '第四個',
    last: '最後一個',
  },
};

function parseSelectedDate(selectedDate: string) {
  const value = new Date(`${selectedDate}T12:00:00.000Z`);
  if (Number.isNaN(value.getTime()))
    throw new TypeError('Recurrence date must be a valid local date.');
  return value;
}

function positiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function boundedInteger(value: string, minimum: number, maximum: number): number | null {
  const parsed = positiveInteger(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function localDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function anchorOrdinal(dayOfMonth: number): Ordinal {
  const ordinal = Math.ceil(dayOfMonth / 7);
  return ordinal <= 4 ? (ordinal as Ordinal) : -1;
}

function initialPreset(recurrence: MissionRecurrence | null): Preset {
  if (recurrence === null) return 'none';
  switch (recurrence.pattern.type) {
    case 'daily':
      return recurrence.pattern.interval === 1 ? 'daily' : 'custom';
    case 'weekly':
      return recurrence.pattern.interval === 1 ? 'weekly' : 'custom';
    case 'monthly-date':
    case 'monthly-ordinal':
      return recurrence.pattern.interval === 1 ? 'monthly' : 'custom';
    case 'yearly-date':
    case 'yearly-ordinal':
      return recurrence.pattern.interval === 1 ? 'yearly' : 'custom';
  }
}

function initialCustomFrequency(recurrence: MissionRecurrence | null): CustomFrequency {
  if (recurrence === null) return 'weekly';
  switch (recurrence.pattern.type) {
    case 'daily':
      return 'daily';
    case 'weekly':
      return 'weekly';
    case 'monthly-date':
    case 'monthly-ordinal':
      return 'monthly';
    case 'yearly-date':
    case 'yearly-ordinal':
      return 'yearly';
  }
}

function initialInterval(recurrence: MissionRecurrence | null): string {
  return String(recurrence?.pattern.interval ?? 1);
}

function initialWeekdays(recurrence: MissionRecurrence | null, anchorWeekday: number): number[] {
  return recurrence?.pattern.type === 'weekly' ? [...recurrence.pattern.weekdays] : [anchorWeekday];
}

function initialMonthlyMode(recurrence: MissionRecurrence | null): MonthlyMode {
  return recurrence?.pattern.type === 'monthly-ordinal' ? 'ordinal' : 'date';
}

function initialYearlyMode(recurrence: MissionRecurrence | null): YearlyMode {
  return recurrence?.pattern.type === 'yearly-ordinal' ? 'ordinal' : 'date';
}

function initialOrdinal(recurrence: MissionRecurrence | null, fallback: Ordinal): Ordinal {
  if (
    recurrence?.pattern.type === 'monthly-ordinal' ||
    recurrence?.pattern.type === 'yearly-ordinal'
  ) {
    return recurrence.pattern.ordinal;
  }
  return fallback;
}

function initialOrdinalWeekday(recurrence: MissionRecurrence | null, fallback: number): number {
  if (
    recurrence?.pattern.type === 'monthly-ordinal' ||
    recurrence?.pattern.type === 'yearly-ordinal'
  ) {
    return recurrence.pattern.weekday;
  }
  return fallback;
}

function initialMonth(recurrence: MissionRecurrence | null, fallback: number): string {
  if (recurrence?.pattern.type === 'yearly-date' || recurrence?.pattern.type === 'yearly-ordinal') {
    return String(recurrence.pattern.month);
  }
  return String(fallback);
}

function initialDay(recurrence: MissionRecurrence | null, fallback: number): string {
  if (recurrence?.pattern.type === 'monthly-date') return String(recurrence.pattern.dayOfMonth);
  if (recurrence?.pattern.type === 'yearly-date') return String(recurrence.pattern.day);
  return String(fallback);
}

function initialEndMode(recurrence: MissionRecurrence | null): EndMode {
  return recurrence?.end.type ?? 'never';
}

function initialEndDate(recurrence: MissionRecurrence | null): string {
  return recurrence?.end.type === 'date' ? recurrence.end.inclusiveLocalDate : '';
}

function initialEndCount(recurrence: MissionRecurrence | null): string {
  return recurrence?.end.type === 'count' ? String(recurrence.end.occurrenceCount) : '1';
}

export function CalendarRecurrenceEditor({
  colorScheme,
  initialRecurrence,
  language,
  onCancel,
  onDone,
  selectedDate,
}: CalendarRecurrenceEditorProps) {
  const colors = themeColors(colorScheme);
  const catalog = localizationCatalogs[language];
  const copy = editorCopy[language];
  const anchor = parseSelectedDate(selectedDate);
  const anchorWeekday = anchor.getUTCDay();
  const anchorDay = anchor.getUTCDate();
  const anchorMonth = anchor.getUTCMonth() + 1;

  const [preset, setPreset] = useState<Preset>(() => initialPreset(initialRecurrence));
  const [customFrequency, setCustomFrequency] = useState<CustomFrequency>(() =>
    initialCustomFrequency(initialRecurrence),
  );
  const [interval, setInterval] = useState(() => initialInterval(initialRecurrence));
  const [weekdays, setWeekdays] = useState<number[]>(() =>
    initialWeekdays(initialRecurrence, anchorWeekday),
  );
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>(() =>
    initialMonthlyMode(initialRecurrence),
  );
  const [yearlyMode, setYearlyMode] = useState<YearlyMode>(() =>
    initialYearlyMode(initialRecurrence),
  );
  const [ordinal, setOrdinal] = useState<Ordinal>(() =>
    initialOrdinal(initialRecurrence, anchorOrdinal(anchorDay)),
  );
  const [ordinalWeekday, setOrdinalWeekday] = useState(() =>
    initialOrdinalWeekday(initialRecurrence, anchorWeekday),
  );
  const [month, setMonth] = useState(() => initialMonth(initialRecurrence, anchorMonth));
  const [day, setDay] = useState(() => initialDay(initialRecurrence, anchorDay));
  const [endMode, setEndMode] = useState<EndMode>(() => initialEndMode(initialRecurrence));
  const [endDate, setEndDate] = useState(() => initialEndDate(initialRecurrence));
  const [endCount, setEndCount] = useState(() => initialEndCount(initialRecurrence));

  const optionStyle = [styles.option, { borderColor: colors.border }];
  const textStyle = [styles.optionText, { color: colors.textPrimary }];

  const choosePreset = (value: Preset) => {
    setPreset(value);
    setInterval('1');
    if (value === 'weekly') setWeekdays([anchorWeekday]);
    if (value === 'monthly') {
      setMonthlyMode('date');
      setDay(String(anchorDay));
    }
    if (value === 'yearly') {
      setYearlyMode('date');
      setMonth(String(anchorMonth));
      setDay(String(anchorDay));
    }
    if (value === 'custom') {
      setCustomFrequency('weekly');
      setWeekdays([anchorWeekday]);
    }
  };

  const toggleWeekday = (weekday: number) => {
    setWeekdays((current) => {
      if (current.includes(weekday)) return current.filter((value) => value !== weekday);
      return [...current, weekday].sort((left, right) => left - right);
    });
  };

  const renderWeekdayButtons = (singleSelection: boolean) => (
    <View style={styles.compactRow}>
      {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
        <Pressable
          accessibilityRole={singleSelection ? 'radio' : 'checkbox'}
          accessibilityState={
            singleSelection
              ? { checked: ordinalWeekday === weekday }
              : { checked: weekdays.includes(weekday) }
          }
          key={weekday}
          onPress={() => {
            if (singleSelection) setOrdinalWeekday(weekday);
            else toggleWeekday(weekday);
          }}
          style={optionStyle}
          testID={`recurrence-weekday-${String(weekday)}`}
        >
          <Text allowFontScaling style={textStyle}>
            {String(weekday)}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const renderOrdinalButtons = () => (
    <View style={styles.compactRow}>
      {(
        [
          [1, copy.first, 'first'],
          [2, copy.second, 'second'],
          [3, copy.third, 'third'],
          [4, copy.fourth, 'fourth'],
          [-1, copy.last, 'last'],
        ] as const
      ).map(([value, label, id]) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: ordinal === value }}
          key={id}
          onPress={() => setOrdinal(value)}
          style={optionStyle}
          testID={`recurrence-ordinal-${id}`}
        >
          <Text allowFontScaling style={textStyle}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const buildEnd = (): RecurrenceEnd | null => {
    if (endMode === 'never') return { type: 'never' };
    if (endMode === 'date') {
      const value = endDate.trim();
      return localDate(value) ? { type: 'date', inclusiveLocalDate: value } : null;
    }
    const occurrenceCount = positiveInteger(endCount);
    return occurrenceCount === null ? null : { type: 'count', occurrenceCount };
  };

  const buildPattern = (): RecurrencePattern | null => {
    if (preset === 'none') return null;
    const parsedInterval = positiveInteger(interval);
    if (parsedInterval === null) return null;
    const effectiveFrequency = preset === 'custom' ? customFrequency : preset;

    if (effectiveFrequency === 'daily') return { type: 'daily', interval: parsedInterval };
    if (effectiveFrequency === 'weekly') {
      if (weekdays.length === 0) return null;
      return { type: 'weekly', interval: parsedInterval, weekdays, weekStartsOn: 1 };
    }
    if (effectiveFrequency === 'monthly') {
      if (monthlyMode === 'ordinal') {
        return {
          type: 'monthly-ordinal',
          interval: parsedInterval,
          ordinal,
          weekday: ordinalWeekday,
        };
      }
      const dayOfMonth = boundedInteger(day, 1, 31);
      return dayOfMonth === null
        ? null
        : { type: 'monthly-date', interval: parsedInterval, dayOfMonth };
    }

    const parsedMonth = boundedInteger(month, 1, 12);
    if (parsedMonth === null) return null;
    if (yearlyMode === 'ordinal') {
      return {
        type: 'yearly-ordinal',
        interval: parsedInterval,
        month: parsedMonth,
        ordinal,
        weekday: ordinalWeekday,
      };
    }
    const parsedDay = boundedInteger(day, 1, 31);
    return parsedDay === null
      ? null
      : { type: 'yearly-date', interval: parsedInterval, month: parsedMonth, day: parsedDay };
  };

  const finish = () => {
    if (preset === 'none') {
      onDone(null);
      return;
    }
    const pattern = buildPattern();
    const end = buildEnd();
    if (pattern === null || end === null) return;
    onDone({ pattern, end });
  };

  const effectiveFrequency = preset === 'custom' ? customFrequency : preset;

  return (
    <View
      accessibilityRole="summary"
      style={[styles.editor, { borderColor: colors.border }]}
      testID="calendar-recurrence-editor"
    >
      <Text allowFontScaling style={[styles.heading, { color: colors.textPrimary }]}>
        {catalog['calendar.recurrence.title']}
      </Text>
      <View style={styles.wrapRow}>
        {(
          [
            ['none', catalog['calendar.create.doesNotRepeat'], 'recurrence-preset-none'],
            ['daily', catalog['calendar.recurrence.daily'], 'recurrence-preset-daily'],
            ['weekly', catalog['calendar.recurrence.weekly'], 'recurrence-preset-weekly'],
            ['monthly', catalog['calendar.recurrence.monthly'], 'recurrence-preset-monthly'],
            ['yearly', catalog['calendar.recurrence.yearly'], 'recurrence-preset-yearly'],
            ['custom', catalog['calendar.recurrence.custom'], 'recurrence-preset-custom'],
          ] as const
        ).map(([value, label, testID]) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: preset === value }}
            key={value}
            onPress={() => choosePreset(value)}
            style={optionStyle}
            testID={testID}
          >
            <Text allowFontScaling style={textStyle}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {preset === 'custom' ? (
        <View style={styles.wrapRow}>
          {(
            [
              ['daily', copy.daily, 'recurrence-custom-daily'],
              ['weekly', copy.weekly, 'recurrence-custom-weekly'],
              ['monthly', copy.monthly, 'recurrence-custom-monthly'],
              ['yearly', copy.yearly, 'recurrence-custom-yearly'],
            ] as const
          ).map(([value, label, testID]) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: customFrequency === value }}
              key={value}
              onPress={() => {
                setCustomFrequency(value);
                setInterval('1');
                if (value === 'weekly') setWeekdays([anchorWeekday]);
              }}
              style={optionStyle}
              testID={testID}
            >
              <Text allowFontScaling style={textStyle}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {preset === 'none' ? null : (
        <TextInput
          accessibilityLabel={copy.interval}
          keyboardType="number-pad"
          onChangeText={setInterval}
          style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
          testID="recurrence-interval"
          value={interval}
        />
      )}

      {effectiveFrequency === 'weekly' ? renderWeekdayButtons(false) : null}

      {effectiveFrequency === 'monthly' ? (
        <>
          <View style={styles.wrapRow}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: monthlyMode === 'date' }}
              onPress={() => setMonthlyMode('date')}
              style={optionStyle}
              testID="recurrence-monthly-date"
            >
              <Text allowFontScaling style={textStyle}>
                {copy.sameDate}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: monthlyMode === 'ordinal' }}
              onPress={() => {
                setMonthlyMode('ordinal');
                setOrdinal(anchorOrdinal(anchorDay));
                setOrdinalWeekday(anchorWeekday);
              }}
              style={optionStyle}
              testID="recurrence-monthly-ordinal"
            >
              <Text allowFontScaling style={textStyle}>
                {copy.ordinalWeekday}
              </Text>
            </Pressable>
          </View>
          {monthlyMode === 'date' ? (
            <TextInput
              keyboardType="number-pad"
              onChangeText={setDay}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              testID="recurrence-day"
              value={day}
            />
          ) : (
            <>
              {renderOrdinalButtons()}
              {renderWeekdayButtons(true)}
            </>
          )}
        </>
      ) : null}

      {effectiveFrequency === 'yearly' ? (
        <>
          <View style={styles.wrapRow}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: yearlyMode === 'date' }}
              onPress={() => setYearlyMode('date')}
              style={optionStyle}
              testID="recurrence-yearly-date"
            >
              <Text allowFontScaling style={textStyle}>
                {copy.sameDate}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: yearlyMode === 'ordinal' }}
              onPress={() => {
                setYearlyMode('ordinal');
                setOrdinal(anchorOrdinal(anchorDay));
                setOrdinalWeekday(anchorWeekday);
              }}
              style={optionStyle}
              testID="recurrence-yearly-ordinal"
            >
              <Text allowFontScaling style={textStyle}>
                {copy.ordinalWeekday}
              </Text>
            </Pressable>
          </View>
          <TextInput
            keyboardType="number-pad"
            onChangeText={setMonth}
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            testID="recurrence-month"
            value={month}
          />
          {yearlyMode === 'date' ? (
            <TextInput
              keyboardType="number-pad"
              onChangeText={setDay}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              testID="recurrence-day"
              value={day}
            />
          ) : (
            <>
              {renderOrdinalButtons()}
              {renderWeekdayButtons(true)}
            </>
          )}
        </>
      ) : null}

      <Text allowFontScaling style={[styles.sectionHeading, { color: colors.textPrimary }]}>
        {catalog['calendar.recurrence.ends']}
      </Text>
      <View style={styles.wrapRow}>
        {(
          [
            ['never', catalog['calendar.recurrence.never'], 'recurrence-end-never'],
            ['date', catalog['calendar.recurrence.onDate'], 'recurrence-end-date'],
            ['count', catalog['calendar.recurrence.afterCount'], 'recurrence-end-count'],
          ] as const
        ).map(([value, label, testID]) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: endMode === value }}
            key={value}
            onPress={() => setEndMode(value)}
            style={optionStyle}
            testID={testID}
          >
            <Text allowFontScaling style={textStyle}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {endMode === 'date' ? (
        <TextInput
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
          style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
          testID="recurrence-end-date-input"
          value={endDate}
        />
      ) : null}
      {endMode === 'count' ? (
        <TextInput
          keyboardType="number-pad"
          onChangeText={setEndCount}
          style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
          testID="recurrence-end-count-input"
          value={endCount}
        />
      ) : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={optionStyle}>
          <Text allowFontScaling style={textStyle}>
            {catalog['calendar.create.cancel']}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={finish}
          style={optionStyle}
          testID="recurrence-done"
        >
          <Text allowFontScaling style={textStyle}>
            {catalog['calendar.recurrence.done']}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  editor: {
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space[3],
    padding: space[3],
  },
  heading: {
    fontSize: typography.headline.fontSize,
    fontWeight: typography.headline.fontWeight,
  },
  sectionHeading: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  compactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[1],
  },
  option: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  optionText: {
    fontSize: typography.body.fontSize,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: typography.body.fontSize,
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
    justifyContent: 'flex-end',
  },
});
