import { type ReactNode, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { evaluateSchedulePlacement, type RewardEligibility } from '@misyra/domain';
import { layout, radius, space, typography } from '@misyra/design-tokens';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { themeColors, type ColorScheme } from '../design-system/index.js';
import { haptics } from '../experience/native-haptics.js';
import { formatTimelineTime, TimedTimeline } from './calendar-timeline.js';

const SLOT_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;
const TIMELINE_GUTTER = space[10] + space[3];

export type CalendarMissionCreateInput = Readonly<{
  selectedDate: string;
  title: string;
  startMinute: number;
  endMinute: number;
  rewardEligibility: RewardEligibility;
}>;

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

function localDateMinuteInstant(localDate: string, minute: number): string {
  const [yearText, monthText, dayText] = localDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Math.floor(minute / 60);
  const minuteWithinHour = minute % 60;
  const local = new Date(year, month - 1, day, hour, minuteWithinHour, 0, 0);
  if (!Number.isFinite(local.getTime())) {
    throw new TypeError('Calendar slot must resolve to a valid local date and time.');
  }
  return local.toISOString();
}

function placementForSlot(selectedDate: string, minute: number, now: Date) {
  return evaluateSchedulePlacement({
    targetStartInstant: localDateMinuteInstant(selectedDate, minute),
    actionInstant: now.toISOString(),
    currentRewardEligibility: 'undetermined',
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
  const [selectedSlotMinute, setSelectedSlotMinute] = useState<number | null>(null);
  const [creationSlotMinute, setCreationSlotMinute] = useState<number | null>(null);
  const [title, setTitle] = useState('');

  const clearSelection = () => {
    setSelectedSlotMinute(null);
  };

  const closeCreation = () => {
    setCreationSlotMinute(null);
    setSelectedSlotMinute(null);
    setTitle('');
  };

  const slotLayer = (
    <View pointerEvents="box-none" style={styles.slotLayer} testID="calendar-slot-layer">
      {Array.from(
        { length: MINUTES_PER_DAY / SLOT_MINUTES },
        (_, index) => index * SLOT_MINUTES,
      ).map((minute) => {
        const placement = placementForSlot(selectedDate, minute, now);
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
                setTitle('');
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

  const creationPlacement =
    creationSlotMinute === null ? null : placementForSlot(selectedDate, creationSlotMinute, now);

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
      {creationSlotMinute === null ? null : (
        <Modal animationType="fade" onRequestClose={closeCreation} transparent visible>
          <Pressable
            accessibilityLabel={catalog['calendar.create.cancel']}
            accessibilityRole="button"
            onPress={closeCreation}
            style={[styles.backdrop, { backgroundColor: colors.overlay }]}
            testID="calendar-create-backdrop"
          >
            <View
              accessibilityViewIsModal
              onStartShouldSetResponder={() => true}
              style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]}
              testID="calendar-create-sheet"
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
                style={[
                  styles.titleInput,
                  {
                    borderColor: colors.border,
                    color: colors.textPrimary,
                  },
                ]}
                testID="calendar-create-title"
                value={title}
              />
              <View style={styles.timeRow}>
                <TextInput
                  accessibilityLabel={catalog['calendar.create.start']}
                  editable={false}
                  style={[styles.timeValue, { color: colors.textSecondary }]}
                  testID="calendar-create-start"
                  value={formatSlotTime(creationSlotMinute, language, uses24HourClock)}
                />
                <TextInput
                  accessibilityLabel={catalog['calendar.create.end']}
                  editable={false}
                  style={[styles.timeValue, { color: colors.textSecondary }]}
                  testID="calendar-create-end"
                  value={formatSlotTime(
                    creationSlotMinute + SLOT_MINUTES,
                    language,
                    uses24HourClock,
                  )}
                />
              </View>
              <View style={styles.actions}>
                <Pressable
                  accessibilityLabel={catalog['calendar.create.cancel']}
                  accessibilityRole="button"
                  onPress={closeCreation}
                  style={styles.action}
                  testID="calendar-create-cancel"
                >
                  <Text
                    allowFontScaling
                    style={[styles.actionText, { color: colors.textSecondary }]}
                  >
                    {catalog['calendar.create.cancel']}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={catalog['calendar.create.save']}
                  accessibilityRole="button"
                  onPress={() => {
                    if (
                      creationPlacement === null ||
                      !creationPlacement.allowed ||
                      title.trim().length === 0
                    ) {
                      return;
                    }
                    void onCreateMission?.({
                      selectedDate,
                      title: title.trim(),
                      startMinute: creationSlotMinute,
                      endMinute: creationSlotMinute + SLOT_MINUTES,
                      rewardEligibility: creationPlacement.rewardEligibility,
                    });
                    haptics.triggerNonBlocking('save');
                    closeCreation();
                  }}
                  style={styles.action}
                  testID="calendar-create-save"
                >
                  <Text allowFontScaling style={[styles.actionText, { color: colors.primary }]}>
                    {catalog['calendar.create.save']}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>
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
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    padding: space[4],
  },
  sheet: {
    borderRadius: radius.lg,
    gap: space[3],
    maxWidth: layout.maximumPhoneWidth,
    padding: space[4],
    width: '100%',
  },
  heading: {
    fontSize: typography.headline.fontSize,
    fontWeight: typography.headline.fontWeight,
  },
  titleInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: typography.body.fontSize,
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
  },
  timeRow: {
    flexDirection: 'row',
    gap: space[2],
  },
  timeValue: {
    flex: 1,
    fontSize: typography.bodySmall.fontSize,
    minHeight: layout.minimumTouchTarget,
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
