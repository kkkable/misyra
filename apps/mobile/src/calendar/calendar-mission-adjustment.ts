import {
  createZonedTimedSchedule,
  evaluateSchedulePlacement,
  resolveRewardEligibilityAfterEdit,
  type RewardEligibility,
} from '@misyra/domain';

const SNAP_MINUTES = 15;
const MINUTES_PER_DAY = 24 * 60;

export type MissionAdjustmentKind = 'move' | 'resize';
export type MissionAdjustmentWarning = 'past_zero_xp' | 'after_start_zero_xp' | null;

export interface AdjustableTimedMission {
  readonly id: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly rewardEligibility: RewardEligibility;
  readonly timeZone: string;
}

export interface MissionAdjustmentPreview {
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface MissionAdjustmentCommitInput {
  readonly mission: AdjustableTimedMission;
  readonly kind: MissionAdjustmentKind;
  readonly translationY: number;
  readonly selectedDate: string;
  readonly now: Date;
}

export interface AllowedMissionAdjustment {
  readonly allowed: true;
  readonly missionId: string;
  readonly kind: MissionAdjustmentKind;
  readonly previousStartMinute: number;
  readonly previousEndMinute: number;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly rewardEligibility: RewardEligibility;
  readonly warning: MissionAdjustmentWarning;
}

export interface RejectedMissionAdjustment {
  readonly allowed: false;
  readonly missionId: string;
  readonly kind: MissionAdjustmentKind;
  readonly previousStartMinute: number;
  readonly previousEndMinute: number;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly rewardEligibility: RewardEligibility;
  readonly warning: null;
  readonly reason: 'historical_window_exceeded';
}

export type MissionAdjustmentResult = AllowedMissionAdjustment | RejectedMissionAdjustment;

export interface MissionAdjustmentSave {
  readonly missionId: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly rewardEligibility: RewardEligibility;
  readonly source: MissionAdjustmentKind | 'undo';
}

export type MissionAdjustmentSaver = (adjustment: MissionAdjustmentSave) => Promise<void>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function assertMissionMinutes(mission: AdjustableTimedMission): void {
  if (
    !Number.isFinite(mission.startMinute) ||
    !Number.isFinite(mission.endMinute) ||
    mission.startMinute < 0 ||
    mission.endMinute > MINUTES_PER_DAY ||
    mission.endMinute <= mission.startMinute
  ) {
    throw new RangeError('Mission minutes must form a valid timed interval within one day.');
  }
}

function dateWithDayOffset(date: string, offset: number): string {
  const instant = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(instant.getTime())) {
    throw new TypeError('Selected date must be an ISO local date.');
  }
  instant.setUTCDate(instant.getUTCDate() + offset);
  return instant.toISOString().slice(0, 10);
}

function localDateTime(date: string, minute: number): string {
  const boundedMinute = clamp(minute, 0, MINUTES_PER_DAY);
  const dayOffset = Math.floor(boundedMinute / MINUTES_PER_DAY);
  const minuteInDay = boundedMinute % MINUTES_PER_DAY;
  const hour = Math.floor(minuteInDay / 60);
  const minuteOfHour = minuteInDay % 60;
  const localDate = dateWithDayOffset(date, dayOffset);
  return `${localDate}T${String(hour).padStart(2, '0')}:${String(minuteOfHour).padStart(2, '0')}:00`;
}

function scheduleFor(date: string, startMinute: number, endMinute: number, timeZone: string) {
  return createZonedTimedSchedule({
    localStart: localDateTime(date, startMinute),
    localFinish: localDateTime(date, endMinute),
    timeZone,
    timeBehavior: 'local_time',
  });
}

export function snapTimelineMinute(minute: number): number {
  if (!Number.isFinite(minute)) {
    throw new TypeError('Timeline minute must be finite.');
  }
  return clamp(Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES, 0, MINUTES_PER_DAY);
}

export function previewMissionAdjustment(
  mission: AdjustableTimedMission,
  kind: MissionAdjustmentKind,
  translationY: number,
): MissionAdjustmentPreview {
  assertMissionMinutes(mission);
  if (!Number.isFinite(translationY)) {
    throw new TypeError('Gesture translation must be finite.');
  }

  if (kind === 'move') {
    const duration = mission.endMinute - mission.startMinute;
    const startMinute = clamp(mission.startMinute + translationY, 0, MINUTES_PER_DAY - duration);
    return Object.freeze({ startMinute, endMinute: startMinute + duration });
  }

  return Object.freeze({
    startMinute: mission.startMinute,
    endMinute: clamp(
      mission.endMinute + translationY,
      mission.startMinute + SNAP_MINUTES,
      MINUTES_PER_DAY,
    ),
  });
}

function snappedResizeEnd(previewEnd: number, translationY: number): number {
  if (translationY > 0) {
    return Math.ceil(previewEnd / SNAP_MINUTES) * SNAP_MINUTES;
  }
  if (translationY < 0) {
    return Math.floor(previewEnd / SNAP_MINUTES) * SNAP_MINUTES;
  }
  return snapTimelineMinute(previewEnd);
}

export function commitMissionAdjustment(
  input: MissionAdjustmentCommitInput,
): MissionAdjustmentResult {
  const { mission, kind, selectedDate, translationY } = input;
  const preview = previewMissionAdjustment(mission, kind, translationY);
  const duration = mission.endMinute - mission.startMinute;

  const startMinute =
    kind === 'move'
      ? clamp(snapTimelineMinute(preview.startMinute), 0, MINUTES_PER_DAY - duration)
      : mission.startMinute;
  const endMinute =
    kind === 'move'
      ? startMinute + duration
      : clamp(
          snappedResizeEnd(preview.endMinute, translationY),
          mission.startMinute + SNAP_MINUTES,
          MINUTES_PER_DAY,
        );

  const originalSchedule = scheduleFor(
    selectedDate,
    mission.startMinute,
    mission.endMinute,
    mission.timeZone,
  );
  const targetSchedule = scheduleFor(selectedDate, startMinute, endMinute, mission.timeZone);
  const actionInstant = input.now.toISOString();
  const afterEditEligibility = resolveRewardEligibilityAfterEdit({
    scheduledStartInstant: originalSchedule.startInstant,
    savedAtInstant: actionInstant,
    currentRewardEligibility: mission.rewardEligibility,
  });
  const placement = evaluateSchedulePlacement({
    targetStartInstant: targetSchedule.startInstant,
    actionInstant,
    currentRewardEligibility: afterEditEligibility,
  });

  if (!placement.allowed) {
    return Object.freeze({
      allowed: false,
      missionId: mission.id,
      kind,
      previousStartMinute: mission.startMinute,
      previousEndMinute: mission.endMinute,
      startMinute,
      endMinute,
      rewardEligibility: placement.rewardEligibility,
      warning: null,
      reason: placement.reason,
    });
  }

  const targetIsPast = new Date(targetSchedule.startInstant).getTime() < input.now.getTime();
  const becameIneligible =
    mission.rewardEligibility === 'eligible' && placement.rewardEligibility === 'ineligible';
  const warning: MissionAdjustmentWarning = becameIneligible
    ? targetIsPast
      ? 'past_zero_xp'
      : 'after_start_zero_xp'
    : null;

  return Object.freeze({
    allowed: true,
    missionId: mission.id,
    kind,
    previousStartMinute: mission.startMinute,
    previousEndMinute: mission.endMinute,
    startMinute,
    endMinute,
    rewardEligibility: placement.rewardEligibility,
    warning,
  });
}

export function createMissionAdjustmentUndoController(save: MissionAdjustmentSaver) {
  let latest: AllowedMissionAdjustment | null = null;

  return {
    commit(adjustment: MissionAdjustmentResult): Promise<void> {
      if (!adjustment.allowed) {
        return Promise.resolve();
      }
      latest = adjustment;
      return save({
        missionId: adjustment.missionId,
        startMinute: adjustment.startMinute,
        endMinute: adjustment.endMinute,
        rewardEligibility: adjustment.rewardEligibility,
        source: adjustment.kind,
      });
    },
    async undo(): Promise<boolean> {
      const adjustment = latest;
      if (adjustment === null) {
        return false;
      }
      latest = null;
      await save({
        missionId: adjustment.missionId,
        startMinute: adjustment.previousStartMinute,
        endMinute: adjustment.previousEndMinute,
        rewardEligibility: adjustment.rewardEligibility,
        source: 'undo',
      });
      return true;
    },
  };
}
