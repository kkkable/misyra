import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

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
import { formatTimelineTime } from './calendar-timeline.js';

const MINUTES_PER_DAY = 24 * 60;

interface CalendarMissionFormSheetProps {
  readonly colorScheme: ColorScheme;
  readonly creationSlotMinute: number;
  readonly language: LocalizationLocale;
  readonly now: Date;
  readonly onCancel: () => void;
  readonly onSubmit: (input: CalendarMissionCreateInput) => void | Promise<void>;
  readonly selectedDate: string;
  readonly timeZone: string;
  readonly uses24HourClock: boolean;
}

function localDateTime(localDate: string, minute: number): string {
  if (minute === MINUTES_PER_DAY) {
    const date = new Date(`${localDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return `${date.toISOString().slice(0, 10)}T00:00:00`;
  }
  const hour = Math.floor(minute / 60);
  const minuteWithinHour = minute % 60;
  return `${localDate}T${String(hour).padStart(2, '0')}:${String(minuteWithinHour).padStart(2, '0')}:00`;
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
  language,
  now,
  onCancel,
  onSubmit,
  selectedDate,
  timeZone: initialTimeZone,
  uses24HourClock,
}: CalendarMissionFormSheetProps) {
  const colors = themeColors(colorScheme);
  const catalog = localizationCatalogs[language];
  const [title, setTitle] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [effort, setEffort] = useState('30');
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [timeBehavior, setTimeBehavior] = useState<TimeBehavior>('local_time');
  const [isPrivate, setIsPrivate] = useState(false);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [validationVisible, setValidationVisible] = useState(false);
  const [zeroXpWarningVisible, setZeroXpWarningVisible] = useState(false);

  const endMinute = creationSlotMinute + 30;
  const estimatedEffortMinutes = allDay ? parseEffort(effort) : null;
  const draft = {
    title,
    selectedDate,
    allDay,
    startMinute: allDay ? null : creationSlotMinute,
    endMinute: allDay ? null : endMinute,
    estimatedEffortMinutes,
    timeZone,
  } as const;
  const validation = validateMissionForm(draft);
  const placement = validation.valid
    ? resolvePlacement({
        allDay,
        endMinute,
        estimatedEffortMinutes,
        now,
        selectedDate,
        startMinute: creationSlotMinute,
        timeBehavior,
        timeZone,
      })
    : null;

  const buildInput = (rewardEligibility: RewardEligibility): CalendarMissionCreateInput => ({
    selectedDate,
    title: title.trim(),
    allDay,
    startMinute: allDay ? null : creationSlotMinute,
    endMinute: allDay ? null : endMinute,
    estimatedEffortMinutes,
    rewardEligibility,
    timeZone: timeZone.trim(),
    timeBehavior,
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

  const formatTime = (minute: number) =>
    formatTimelineTime(minute % MINUTES_PER_DAY, language, uses24HourClock);

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
          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              accessibilityRole="header"
              allowFontScaling
              style={[styles.heading, { color: colors.textPrimary }]}
            >
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
            <TextInput
              accessibilityLabel={catalog['calendar.create.date']}
              editable={false}
              style={[styles.input, { borderColor: colors.border, color: colors.textSecondary }]}
              testID="calendar-create-date"
              value={selectedDate}
            />
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
            ) : (
              <View style={styles.row}>
                <TextInput
                  accessibilityLabel={catalog['calendar.create.start']}
                  editable={false}
                  style={[
                    styles.input,
                    styles.flexInput,
                    { borderColor: colors.border, color: colors.textSecondary },
                  ]}
                  testID="calendar-create-start"
                  value={formatTime(creationSlotMinute)}
                />
                <TextInput
                  accessibilityLabel={catalog['calendar.create.end']}
                  editable={false}
                  style={[
                    styles.input,
                    styles.flexInput,
                    { borderColor: colors.border, color: colors.textSecondary },
                  ]}
                  testID="calendar-create-end"
                  value={formatTime(endMinute)}
                />
              </View>
            )}
            <TextInput
              accessibilityLabel={catalog['calendar.create.recurrence']}
              editable={false}
              style={[styles.input, { borderColor: colors.border, color: colors.textSecondary }]}
              testID="calendar-create-recurrence"
              value={catalog['calendar.create.doesNotRepeat']}
            />
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
              onPress={() =>
                setTimeBehavior((value) =>
                  value === 'local_time' ? 'fixed_instant' : 'local_time',
                )
              }
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
              onPress={() => setIsPrivate((value) => !value)}
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
                  onPress={() => submit(true)}
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
                onPress={() => submit(false)}
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
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    padding: space[4],
  },
  sheet: {
    borderRadius: radius.lg,
    maxHeight: '90%',
    maxWidth: layout.maximumPhoneWidth,
    width: '100%',
  },
  formContent: {
    gap: space[3],
    padding: space[4],
  },
  heading: {
    fontSize: typography.headline.fontSize,
    fontWeight: typography.headline.fontWeight,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: typography.body.fontSize,
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  row: {
    flexDirection: 'row',
    gap: space[2],
  },
  flexInput: {
    flex: 1,
  },
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
  bodyText: {
    fontSize: typography.body.fontSize,
  },
  notesInput: {
    minHeight: layout.minimumTouchTarget * 2,
    textAlignVertical: 'top',
  },
  warningGroup: {
    gap: space[2],
  },
  warningText: {
    fontSize: typography.bodySmall.fontSize,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget * 2,
    paddingHorizontal: space[3],
  },
  actionText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
});
