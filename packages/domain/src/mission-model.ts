export type RecurrenceEnd =
  | { type: 'never' }
  | { type: 'date'; inclusiveLocalDate: string }
  | { type: 'count'; occurrenceCount: number };

export type RecurrencePattern =
  | { type: 'daily'; interval: number }
  | { type: 'weekly'; interval: number; weekdays: number[] }
  | { type: 'monthly-date'; interval: number; dayOfMonth: number }
  | {
      type: 'monthly-ordinal';
      interval: number;
      ordinal: 1 | 2 | 3 | 4 | -1;
      weekday: number;
    }
  | { type: 'yearly-date'; interval: number; month: number; day: number }
  | {
      type: 'yearly-ordinal';
      interval: number;
      month: number;
      ordinal: 1 | 2 | 3 | 4 | -1;
      weekday: number;
    };

export interface MissionRecurrence {
  readonly pattern: RecurrencePattern;
  readonly end: RecurrenceEnd;
}

export type TimeBehavior = 'local_time' | 'fixed_instant';
export type ScheduleState = 'scheduled' | 'cancelled';
export type CompletionState = 'incomplete' | 'completed';
export type EvidenceState = 'not_submitted' | 'pending' | 'accepted' | 'rejected' | 'not_required';
export type RewardEligibility = 'undetermined' | 'eligible' | 'ineligible';
export type RewardIssuance = 'not_issued' | 'issued';
export type CalendarSource = 'internal' | 'external';
export type FieldOwnership = 'app_owned' | 'organizer_controlled';
export type SynchronizationState = 'local_only' | 'pending' | 'synced' | 'failed';
export type StoryState = 'none' | 'draft' | 'ready';
export type DeletionState = 'active' | 'deleted';

export interface MissionSchedule {
  readonly localStart: string;
  readonly localFinish: string;
  readonly startInstant: string;
  readonly finishInstant: string;
  readonly timeZone: string;
  readonly timeBehavior: TimeBehavior;
  readonly allDay: boolean;
  readonly estimatedEffortMinutes: number | null;
}

export interface MissionSeries {
  readonly id: string;
  readonly title: string;
  readonly recurrence: MissionRecurrence | null;
}

export interface NonrecurringMissionSeries extends Omit<MissionSeries, 'recurrence'> {
  readonly recurrence: null;
}

export interface MissionOccurrence {
  readonly id: string;
  readonly seriesId: string;
  readonly schedule: MissionSchedule;
  readonly scheduleState: ScheduleState;
  readonly completionState: CompletionState;
  readonly evidenceState: EvidenceState;
  readonly rewardEligibility: RewardEligibility;
  readonly rewardIssuance: RewardIssuance;
  readonly calendarSource: CalendarSource;
  readonly fieldOwnership: FieldOwnership;
  readonly synchronizationState: SynchronizationState;
  readonly storyState: StoryState;
  readonly deletionState: DeletionState;
}

export interface MissionSeriesInput {
  readonly id: string;
  readonly title: string;
  readonly recurrence: MissionRecurrence | null;
}

export interface MissionOccurrenceInput extends Omit<MissionOccurrence, 'schedule'> {
  readonly schedule: MissionSchedule;
}

export interface OneTimeMission {
  readonly series: NonrecurringMissionSeries;
  readonly occurrence: MissionOccurrence;
}

export interface OneTimeMissionInput {
  readonly series: Omit<MissionSeriesInput, 'recurrence'>;
  readonly occurrence: Omit<MissionOccurrenceInput, 'seriesId'>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ORDINALS = [1, 2, 3, 4, -1] as const;
const TIME_BEHAVIORS = ['local_time', 'fixed_instant'] as const;
const SCHEDULE_STATES = ['scheduled', 'cancelled'] as const;
const COMPLETION_STATES = ['incomplete', 'completed'] as const;
const EVIDENCE_STATES = [
  'not_submitted',
  'pending',
  'accepted',
  'rejected',
  'not_required',
] as const;
const REWARD_ELIGIBILITY_STATES = ['undetermined', 'eligible', 'ineligible'] as const;
const REWARD_ISSUANCE_STATES = ['not_issued', 'issued'] as const;
const CALENDAR_SOURCES = ['internal', 'external'] as const;
const FIELD_OWNERSHIP_STATES = ['app_owned', 'organizer_controlled'] as const;
const SYNCHRONIZATION_STATES = ['local_only', 'pending', 'synced', 'failed'] as const;
const STORY_STATES = ['none', 'draft', 'ready'] as const;
const DELETION_STATES = ['active', 'deleted'] as const;

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a UUID.`);
  }
}

function assertNonBlank(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${label} must not be blank.`);
  }
}

function assertIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be an integer from ${String(minimum)} to ${String(maximum)}.`,
    );
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
}

function assertAllowedValue(value: string, allowed: readonly string[], label: string): void {
  if (!allowed.includes(value)) {
    throw new TypeError(`Invalid ${label}: ${value}.`);
  }
}

function copyRecurrencePattern(pattern: RecurrencePattern): RecurrencePattern {
  switch (pattern.type) {
    case 'daily':
      assertPositiveInteger(pattern.interval, 'Recurrence interval');
      return Object.freeze({ ...pattern });
    case 'weekly':
      assertPositiveInteger(pattern.interval, 'Recurrence interval');
      if (pattern.weekdays.length === 0) {
        throw new RangeError('Weekly recurrence must include at least one weekday.');
      }
      for (const weekday of pattern.weekdays) {
        assertIntegerInRange(weekday, 0, 6, 'Recurrence weekday');
      }
      return Object.freeze({
        ...pattern,
        weekdays: Object.freeze([...pattern.weekdays]) as number[],
      });
    case 'monthly-date':
      assertPositiveInteger(pattern.interval, 'Recurrence interval');
      assertIntegerInRange(pattern.dayOfMonth, 1, 31, 'Recurrence day of month');
      return Object.freeze({ ...pattern });
    case 'monthly-ordinal':
      assertPositiveInteger(pattern.interval, 'Recurrence interval');
      if (!ORDINALS.includes(pattern.ordinal)) {
        throw new RangeError('Recurrence ordinal must be first, second, third, fourth, or last.');
      }
      assertIntegerInRange(pattern.weekday, 0, 6, 'Recurrence weekday');
      return Object.freeze({ ...pattern });
    case 'yearly-date':
      assertPositiveInteger(pattern.interval, 'Recurrence interval');
      assertIntegerInRange(pattern.month, 1, 12, 'Recurrence month');
      assertIntegerInRange(pattern.day, 1, 31, 'Recurrence day');
      return Object.freeze({ ...pattern });
    case 'yearly-ordinal':
      assertPositiveInteger(pattern.interval, 'Recurrence interval');
      assertIntegerInRange(pattern.month, 1, 12, 'Recurrence month');
      if (!ORDINALS.includes(pattern.ordinal)) {
        throw new RangeError('Recurrence ordinal must be first, second, third, fourth, or last.');
      }
      assertIntegerInRange(pattern.weekday, 0, 6, 'Recurrence weekday');
      return Object.freeze({ ...pattern });
  }
}

function copyRecurrenceEnd(end: RecurrenceEnd): RecurrenceEnd {
  switch (end.type) {
    case 'never':
      return Object.freeze({ type: 'never' });
    case 'date':
      if (!LOCAL_DATE_PATTERN.test(end.inclusiveLocalDate)) {
        throw new TypeError('Recurrence end date must use YYYY-MM-DD local-date format.');
      }
      return Object.freeze({ ...end });
    case 'count':
      assertPositiveInteger(end.occurrenceCount, 'Recurrence occurrence count');
      return Object.freeze({ ...end });
  }
}

function copyRecurrence(recurrence: MissionRecurrence | null): MissionRecurrence | null {
  if (recurrence === null) {
    return null;
  }
  return Object.freeze({
    pattern: copyRecurrencePattern(recurrence.pattern),
    end: copyRecurrenceEnd(recurrence.end),
  });
}

function copySchedule(schedule: MissionSchedule): MissionSchedule {
  assertNonBlank(schedule.localStart, 'Local start');
  assertNonBlank(schedule.localFinish, 'Local finish');
  assertNonBlank(schedule.timeZone, 'Time zone');
  assertAllowedValue(schedule.timeBehavior, TIME_BEHAVIORS, 'time behavior');

  const startInstant = Date.parse(schedule.startInstant);
  const finishInstant = Date.parse(schedule.finishInstant);
  if (!Number.isFinite(startInstant)) {
    throw new TypeError('Start instant must be a valid timestamp.');
  }
  if (!Number.isFinite(finishInstant)) {
    throw new TypeError('Finish instant must be a valid timestamp.');
  }
  if (finishInstant <= startInstant) {
    throw new RangeError('Finish instant must be after start instant.');
  }
  if (typeof schedule.allDay !== 'boolean') {
    throw new TypeError('All-day state must be boolean.');
  }
  if (schedule.estimatedEffortMinutes !== null) {
    assertPositiveInteger(schedule.estimatedEffortMinutes, 'Estimated effort minutes');
  }

  return Object.freeze({ ...schedule });
}

export function createMissionSeries(input: MissionSeriesInput): MissionSeries {
  assertUuid(input.id, 'Series id');
  assertNonBlank(input.title, 'Mission title');

  return Object.freeze({
    id: input.id,
    title: input.title,
    recurrence: copyRecurrence(input.recurrence),
  });
}

export function createMissionOccurrence(input: MissionOccurrenceInput): MissionOccurrence {
  assertUuid(input.id, 'Occurrence id');
  assertUuid(input.seriesId, 'Series id');
  assertAllowedValue(input.scheduleState, SCHEDULE_STATES, 'schedule state');
  assertAllowedValue(input.completionState, COMPLETION_STATES, 'completion state');
  assertAllowedValue(input.evidenceState, EVIDENCE_STATES, 'evidence state');
  assertAllowedValue(input.rewardEligibility, REWARD_ELIGIBILITY_STATES, 'reward eligibility');
  assertAllowedValue(input.rewardIssuance, REWARD_ISSUANCE_STATES, 'reward issuance');
  assertAllowedValue(input.calendarSource, CALENDAR_SOURCES, 'calendar source');
  assertAllowedValue(input.fieldOwnership, FIELD_OWNERSHIP_STATES, 'field ownership');
  assertAllowedValue(input.synchronizationState, SYNCHRONIZATION_STATES, 'synchronization state');
  assertAllowedValue(input.storyState, STORY_STATES, 'Story state');
  assertAllowedValue(input.deletionState, DELETION_STATES, 'deletion state');

  return Object.freeze({
    ...input,
    schedule: copySchedule(input.schedule),
  });
}

export function createOneTimeMission(input: OneTimeMissionInput): OneTimeMission {
  const seriesBase = createMissionSeries({ ...input.series, recurrence: null });
  const series: NonrecurringMissionSeries = Object.freeze({
    id: seriesBase.id,
    title: seriesBase.title,
    recurrence: null,
  });
  const occurrence = createMissionOccurrence({
    ...input.occurrence,
    seriesId: series.id,
  });

  return Object.freeze({ series, occurrence });
}
