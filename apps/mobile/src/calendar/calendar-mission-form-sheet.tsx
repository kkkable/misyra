import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  createZonedAllDaySchedule,
  createZonedTimedSchedule,
  evaluateSchedulePlacement,
  type RewardEligibility,
  type TimeBehavior,
} from '@misyra/domain';
import { layout, radius, space, typography } from '@misyra/design-tokens';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { themeColors, type ColorScheme } from '../design-system/index.js';
import type { CalendarMissionCreateInput } from './calendar-mission-create.js';
import { validateMissionForm } from './calendar-mission-form.js';
import { CalendarRecurrenceEditor } from './calendar-recurrence-editor.js';
import { formatTimelineTime } from './calendar-timeline.js';

const MINUTES_PER_DAY = 24 * 60;
const MAX_TIMED_END_MINUTE = MINUTES_PER_DAY * 2;

interface CalendarMissionFormSheetProps {
  readonly colorScheme: ColorScheme;
  readonly creationSlotMinute: number;
  readonly initialInput?: CalendarMissionCreateInput | undefined;
  readonly language: LocalizationLocale;
  readonly now: Date;
  readonly onCancel: () => void;
  readonly onSubmit: (input: CalendarMissionCreateInput) => void | Promise<void>;
  readonly selectedDate: string;
  readonly timeZone: string;
  readonly uses24HourClock: boolean;
  readonly weekStartsOn?: number | undefined;
}

function localDateTime(localDate: string, minute: number): string {
  if (!Number.isInteger(minute) || minute < 0 || minute > MAX_TIMED_END_MINUTE) {
    throw new RangeError('Mission minute is outside the supported range.');
  }
  const dayOffset = Math.floor(minute / MINUTES_PER_DAY);
  const minuteWithinDay = minute % MINUTES_PER_DAY;
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  const hour = Math.floor(minuteWithinDay / 60);
  const minuteWithinHour = minuteWithinDay % 60;
  return `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:${String(minuteWithinHour).padStart(2, '0')}:00`;
}

function clockInput(
  minute: number,
  language: LocalizationLocale,
  uses24HourClock: boolean,
): string {
  const boundedMinute = Math.max(0, minute);
  if (!uses24HourClock) {
    return formatTimelineTime(boundedMinute % MINUTES_PER_DAY, language, false);
  }
  return `${String(Math.floor(boundedMinute / 60)).padStart(2, '0')}:${String(boundedMinute % 60).padStart(2, '0')}`;
}

function parseTwelveHourClockInput(value: string): number | null {
  const normalized = value.trim().replaceAll('.', '').replace(/\s+/g, ' ');
  const englishMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(normalized);
  const chineseMatch = /^(上午|下午)\s*(\d{1,2}):(\d{2})$/.exec(normalized);
  const hourText = englishMatch?.[1] ?? chineseMatch?.[2];
  const minuteText = englishMatch?.[2] ?? chineseMatch?.[3];
  const period = englishMatch?.[3]?.toUpperCase() ?? chineseMatch?.[1];

  if (hourText === undefined || minuteText === undefined || period === undefined) return null;

  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null;
  }

  const hourFromMidnight = hour % 12;
  const isAfternoon = period === 'PM' || period === '下午';
  return (hourFromMidnight + (isAfternoon ? 12 : 0)) * 60 + minute;
}

function parseClockInput(
  value: string,
  maximum: number,
  uses24HourClock: boolean,
  startMinute?: number,
): number | null {
  if (!uses24HourClock) {
    const minute = parseTwelveHourClockInput(value);
    if (minute === null) return null;
    const adjustedMinute =
      startMinute !== undefined && maximum > MINUTES_PER_DAY && minute <= startMinute
        ? minute + MINUTES_PER_DAY
        : minute;
    return adjustedMinute <= maximum ? adjustedMinute : null;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  const total = hour * 60 + minute;
  return total >= 0 && total <= maximum ? total : null;
}

function parseEffort(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function resolvePlacement({
  allDay,
  endMinute,
  estimatedEffortMinutes,
  now,
  selectedDate,
  startMinute,
  timeBehavior,
  timeZone,
}: Readonly<{
  allDay: boolean;
  endMinute: number;
  estimatedEffortMinutes: number | null;
  now: Date;
  selectedDate: string;
  startMinute: number;
  timeBehavior: TimeBehavior;
  timeZone: string;
}>): Readonly<{
  allowed: boolean;
  rewardEligibility: RewardEligibility;
}> | null {
  try {
    const schedule = allDay
      ? createZonedAllDaySchedule({
          localDate: selectedDate,
          timeZone,
          estimatedEffortMinutes: estimatedEffortMinutes ?? 0,
        })
      : createZonedTimedSchedule({
          localStart: localDateTime(selectedDate, startMinute),
          localFinish: localDateTime(selectedDate, endMinute),
          timeZone,
          timeBehavior,
        });
    const placement = evaluateSchedulePlacement({
      targetStartInstant: schedule.startInstant,
      actionInstant: now.toISOString(),
      currentRewardEligibility: 'eligible',
    });
    return {
      allowed: placement.allowed,
      rewardEligibility: placement.rewardEligibility,
    };
  } catch {
    return null;
  }
}

export function CalendarMissionFormSheet({
  colorScheme,
  creationSlotMinute,
  initialInput,
  language,
  now,
  onCancel,
  onSubmit,
  selectedDate,
  timeZone: initialTimeZone,
  uses24HourClock,
  weekStartsOn = 1,
}: CalendarMissionFormSheetProps) {
  const colors = themeColors(colorScheme);
  const catalog = localizationCatalogs[language];
  const effectiveSelectedDate = initialInput?.selectedDate ?? selectedDate;
  const initialStartMinute = initialInput?.startMinute ?? creationSlotMinute;
  const defaultEndMinute = initialInput?.endMinute ?? initialStartMinute + 30;
  const [title, setTitle] = useState(initialInput?.title ?? '');
  const [startText, setStartText] = useState(
    clockInput(initialStartMinute, language, uses24HourClock),
  );
  const [endText, setEndText] = useState(
    clockInput(defaultEndMinute, language, uses24HourClock),
  );
  const [moreOptionsVisible, setMoreOptionsVisible] = useState(initialInput !== undefined);
  const [allDay, setAllDay] = useState(initialInput?.allDay ?? false);
  const [effort, setEffort] = useState(String(initialInput?.estimatedEffortMinutes ?? 30));
  const [timeZone, setTimeZone] = useState(initialInput?.timeZone ?? initialTimeZone);
  const [timeBehavior, setTimeBehavior] = useState<TimeBehavior>(
    initialInput?.timeBehavior ?? 'local_time',
  );
  const [recurrence, setRecurrence] = useState(initialInput?.recurrence ?? null);
  const [recurrenceEditorVisible, setRecurrenceEditorVisible] = useState(false);
  const [isPrivate, setIsPrivate] = useState(initialInput?.private ?? false);
  const [location, setLocation] = useState(initialInput?.location ?? '');
  const [notes, setNotes] = useState(initialInput?.notes ?? '');
  const [validationVisible, setValidationVisible] = useState(false);
  const [zeroXpWarningVisible, setZeroXpWarningVisible] = useState(false);

  const startMinute = parseClockInput(startText, MINUTES_PER_DAY, uses24HourClock);
  const endMinute =
    startMinute === null
      ? null
      : parseClockInput(endText, MAX_TIMED_END_MINUTE, uses24HourClock, startMinute);
  const estimatedEffortMinutes = allDay ? parseEffort(effort) : null;
  const draft = {
    title,
    selectedDate: effectiveSelectedDate,
    allDay,
    startMinute: allDay ? null : startMinute,
    endMinute: allDay ? null : endMinute,
    estimatedEffortMinutes,
    timeZone,
  } as const;
  const validation = validateMissionForm(draft);
  const placement =
    validation.valid && startMinute !== null && endMinute !== null
      ? resolvePlacement({
          allDay,
          endMinute,
          estimatedEffortMinutes,
          now,
          selectedDate: effectiveSelectedDate,
          startMinute,
          timeBehavior,
          timeZone,
        })
      : allDay && validation.valid
        ? resolvePlacement({
            allDay,
            endMinute: 0,
            estimatedEffortMinutes,
            now,
            selectedDate: effectiveSelectedDate,
            startMinute: 0,
            timeBehavior,
            timeZone,
          })
        : null;

  const buildInput = (rewardEligibility: RewardEligibility): CalendarMissionCreateInput => ({
    selectedDate: effectiveSelectedDate,
    title: title.trim(),
    allDay,
    startMinute: allDay ? null : startMinute,
    endMinute: allDay ? null : endMinute,
    estimatedEffortMinutes,
    rewardEligibility,
    timeZone: timeZone.trim(),
    timeBehavior,
    recurrence,
    private: isPrivate,
    location: location.trim().length === 0 ? null : location.trim(),
    notes: notes.trim().length === 0 ? null : notes.trim(),
  });

  const submit = (confirmedZeroXp: boolean) => {
    if (!validation.valid || placement === null || !placement.allowed) {
      setValidationVisible(true);
      setZeroXpWarningVisible(false);
      return;
    }
    setValidationVisible(false);
    if (placement.rewardEligibility === 'ineligible' && !confirmedZeroXp) {
      setZeroXpWarningVisible(true);
      return;
    }
    setZeroXpWarningVisible(false);
    void Promise.resolve(onSubmit(buildInput(placement.rewardEligibility))).catch(() => undefined);
  };

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <Pressable
        accessibilityLabel={catalog['calendar.create.cancel']}
        accessibilityRole="button"
        onPress={onCancel}
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        testID="calendar-create-backdrop"
      >
        <View
          accessibilityViewIsModal
          onStartShouldSetResponder={() => true}
          style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]}
          testID="calendar-create-sheet"
        >
          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" allowFontScaling style={[styles.heading, { color: colors.textPrimary }]}> 
              {catalog['calendar.create.title']}
            </Text>
            <TextInput
              accessibilityLabel={catalog['calendar.create.missionTitle']}
              autoFocus
              onChangeText={setTitle}
              placeholder={catalog['calendar.create.missionTitle']}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              testID="calendar-create-title"
              value={title}
            />
            {allDay ? null : (
              <View style={styles.row}>
                <TextInput
                  accessibilityLabel={catalog['calendar.create.start']}
                  autoCapitalize="none"
                  onChangeText={setStartText}
                  placeholder={catalog['calendar.create.timeInputHint']}
                  style={[
                    styles.input,
                    styles.flexInput,
                    { borderColor: colors.border, color: colors.textPrimary },
                  ]}
                  testID="calendar-create-start"
                  value={startText}
                />
                <TextInput
                  accessibilityLabel={catalog['calendar.create.end']}
                  autoCapitalize="none"
                  onChangeText={setEndText}
                  placeholder={catalog['calendar.create.timeInputHint']}
                  style={[
                    styles.input,
                    styles.flexInput,
                    { borderColor: colors.border, color: colors.textPrimary },
                  ]}
                  testID="calendar-create-end"
                  value={endText}
                />
              </View>
            )}
            {moreOptionsVisible ? (
              <>
                <Pressable
                  accessibilityLabel={catalog['calendar.create.recurrence']}
                  accessibilityRole="button"
                  onPress={() => {
                    setRecurrenceEditorVisible(true);
                  }}
                  style={[styles.toggleRow, { borderColor: colors.border }]}
                  testID="calendar-create-recurrence"
                >
                  <Text allowFontScaling style={[styles.bodyText, { color: colors.textPrimary }]}> 
                    {catalog['calendar.create.recurrence']}
                  </Text>
                  <Text allowFontScaling style={[styles.bodyText, { color: colors.textSecondary }]}> 
                    {recurrence === null
                      ? catalog['calendar.create.doesNotRepeat']
                      : catalog['calendar.recurrence.title']}
                  </Text>
                </Pressable>
                {recurrenceEditorVisible ? (
                  <CalendarRecurrenceEditor
                    colorScheme={colorScheme}
                    initialRecurrence={recurrence}
                    language={language}
                    onCancel={() => {
                      setRecurrenceEditorVisible(false);
                    }}
                    onDone={(value) => {
                      setRecurrence(value);
                      setRecurrenceEditorVisible(false);
                    }}
                    selectedDate={effectiveSelectedDate}
                    weekStartsOn={weekStartsOn}
                  />
                ) : null}
                <Pressable
                  accessibilityLabel={catalog['calendar.create.allDay']}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: allDay }}
                  onPress={() => {
                    setAllDay((value) => !value);
                    setValidationVisible(false);
                    setZeroXpWarningVisible(false);
                  }}
                  style={[styles.toggleRow, { borderColor: colors.border }]}
                  testID="calendar-create-all-day"
                >
                  <Text allowFontScaling style={[styles.bodyText, { color: colors.textPrimary }]}> 
                    {catalog['calendar.create.allDay']}
                  </Text>
                  <Text allowFontScaling style={[styles.bodyText, { color: colors.textSecondary }]}> 
                    {allDay ? catalog['calendar.create.on'] : catalog['calendar.create.off']}
                  </Text>
                </Pressable>
                {allDay ? (
                  <TextInput
                    accessibilityLabel={catalog['calendar.create.estimatedEffort']}
                    keyboardType="number-pad"
                    onChangeText={setEffort}
                    placeholder={catalog['calendar.create.estimatedEffort']}
                    style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                    testID="calendar-create-effort"
                    value={effort}
                  />
                ) : null}
                <TextInput
                  accessibilityLabel={catalog['calendar.create.timeZone']}
                  onChangeText={setTimeZone}
                  style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                  testID="calendar-create-time-zone"
                  value={timeZone}
                />
                <Pressable
                  accessibilityLabel={catalog['calendar.create.travelBehavior']}
                  accessibilityRole="button"
                  onPress={() => {
                    setTimeBehavior((value) =>
                      value === 'local_time' ? 'fixed_instant' : 'local_time',
                    );
                  }}
                  style={[styles.toggleRow, { borderColor: colors.border }]}
                  testID="calendar-create-travel-behavior"
                >
                  <Text allowFontScaling style={[styles.bodyText, { color: colors.textPrimary }]}> 
                    {catalog['calendar.create.travelBehavior']}
                  </Text>
                  <Text allowFontScaling style={[styles.bodyText, { color: colors.textSecondary }]}> 
                    {timeBehavior === 'local_time'
                      ? catalog['calendar.create.keepLocalTime']
                      : catalog['calendar.create.fixedInstant']}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={catalog['calendar.create.private']}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isPrivate }}
                  onPress={() => {
                    setIsPrivate((value) => !value);
                  }}
                  style={[styles.toggleRow, { borderColor: colors.border }]}
                  testID="calendar-create-private"
                >
                  <Text allowFontScaling style={[styles.bodyText, { color: colors.textPrimary }]}> 
                    {catalog['calendar.create.private']}
                  </Text>
                  <Text allowFontScaling style={[styles.bodyText, { color: colors.textSecondary }]}> 
                    {isPrivate ? catalog['calendar.create.on'] : catalog['calendar.create.off']}
                  </Text>
                </Pressable>
                <TextInput
                  accessibilityLabel={catalog['calendar.create.location']}
                  onChangeText={setLocation}
                  placeholder={catalog['calendar.create.location']}
                  style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                  testID="calendar-create-location"
                  value={location}
                />
                <TextInput
                  accessibilityLabel={catalog['calendar.create.notes']}
                  multiline
                  onChangeText={setNotes}
                  placeholder={catalog['calendar.create.notes']}
                  style={[
                    styles.input,
                    styles.notesInput,
                    { borderColor: colors.border, color: colors.textPrimary },
                  ]}
                  testID="calendar-create-notes"
                  value={notes}
                />
              </>
            ) : (
              <Pressable
                accessibilityLabel={catalog['calendar.create.moreOptions']}
                accessibilityRole="button"
                onPress={() => {
                  setMoreOptionsVisible(true);
                }}
                style={styles.moreOptions}
                testID="calendar-create-more-options"
              >
                <Text allowFontScaling style={[styles.actionText, { color: colors.primary }]}> 
                  {catalog['calendar.create.moreOptions']}
                </Text>
              </Pressable>
            )}
            {validationVisible ? (
              <Text
                accessibilityRole="alert"
                allowFontScaling
                style={[styles.warningText, { color: colors.late }]}
                testID="calendar-create-validation-error"
              >
                {catalog['calendar.create.validationError']}
              </Text>
            ) : null}
            {zeroXpWarningVisible ? (
              <View style={styles.warningGroup} testID="calendar-create-zero-xp-warning">
                <Text
                  accessibilityRole="alert"
                  allowFontScaling
                  style={[styles.warningText, { color: colors.late }]}
                >
                  {catalog['calendar.create.pastZeroXpWarning']}
                </Text>
                <Pressable
                  accessibilityLabel={catalog['calendar.create.confirmZeroXp']}
                  accessibilityRole="button"
                  onPress={() => {
                    submit(true);
                  }}
                  style={styles.action}
                  testID="calendar-create-confirm-zero-xp"
                >
                  <Text allowFontScaling style={[styles.actionText, { color: colors.primary }]}> 
                    {catalog['calendar.create.confirmZeroXp']}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                accessibilityLabel={catalog['calendar.create.cancel']}
                accessibilityRole="button"
                onPress={onCancel}
                style={styles.action}
                testID="calendar-create-cancel"
              >
                <Text allowFontScaling style={[styles.actionText, { color: colors.textSecondary }]}> 
                  {catalog['calendar.create.cancel']}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={catalog['calendar.create.save']}
                accessibilityRole="button"
                onPress={() => {
                  submit(false);
                }}
                style={styles.action}
                testID="calendar-create-save"
              >
                <Text allowFontScaling style={[styles.actionText, { color: colors.primary }]}> 
                  {catalog['calendar.create.save']}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', flex: 1, justifyContent: 'flex-end', padding: space[4] },
  sheet: {
    borderRadius: radius.lg,
    maxHeight: '90%',
    maxWidth: layout.maximumPhoneWidth,
    width: '100%',
  },
  formContent: { gap: space[3], padding: space[4] },
  heading: { fontSize: typography.headline.fontSize, fontWeight: typography.headline.fontWeight },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: typography.body.fontSize,
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  row: { flexDirection: 'row', gap: space[2] },
  flexInput: { flex: 1 },
  toggleRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  bodyText: { fontSize: typography.body.fontSize },
  notesInput: { minHeight: layout.minimumTouchTarget * 2, textAlignVertical: 'top' },
  warningGroup: { gap: space[2] },
  warningText: { fontSize: typography.bodySmall.fontSize },
  moreOptions: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[1],
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget * 2,
    paddingHorizontal: space[3],
  },
  actionText: { fontSize: typography.body.fontSize, fontWeight: typography.body.mediumFontWeight },
});
