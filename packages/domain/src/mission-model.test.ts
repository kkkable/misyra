import { describe, expect, it } from 'vitest';

import {
  createMissionOccurrence,
  createMissionSeries,
  createOneTimeMission,
  type MissionOccurrence,
  type MissionSeries,
} from './index.js';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type OccurrenceOnlyStateKey =
  'completionState' | 'evidenceState' | 'rewardEligibility' | 'rewardIssuance' | 'storyState';

type RequiredOccurrenceStateKey =
  | 'scheduleState'
  | OccurrenceOnlyStateKey
  | 'calendarSource'
  | 'fieldOwnership'
  | 'synchronizationState'
  | 'deletionState';

const seriesOwnsNoOccurrenceState: Equal<
  Extract<keyof MissionSeries, OccurrenceOnlyStateKey>,
  never
> = true;
const occurrenceOwnsEveryStateDimension: Equal<
  Exclude<RequiredOccurrenceStateKey, keyof MissionOccurrence>,
  never
> = true;
const oneTimeSeriesIsStaticallyNonrecurring: Equal<
  ReturnType<typeof createOneTimeMission>['series']['recurrence'],
  null
> = true;

const validStates = {
  scheduleState: 'scheduled',
  completionState: 'incomplete',
  evidenceState: 'not_submitted',
  rewardEligibility: 'undetermined',
  rewardIssuance: 'not_issued',
  calendarSource: 'internal',
  fieldOwnership: 'app_owned',
  synchronizationState: 'local_only',
  storyState: 'none',
  deletionState: 'active',
} as const;

const validSchedule = {
  localStart: '2026-08-30T09:00:00',
  localFinish: '2026-08-30T09:30:00',
  startInstant: '2026-08-30T00:00:00.000Z',
  finishInstant: '2026-08-30T00:30:00.000Z',
  timeZone: 'Asia/Tokyo',
  timeBehavior: 'local_time',
  allDay: false,
  estimatedEffortMinutes: null,
} as const;

describe('MTS-013 mission series and occurrence contract', () => {
  it('keeps the required type-level separation and independent state dimensions', () => {
    expect(seriesOwnsNoOccurrenceState).toBe(true);
    expect(occurrenceOwnsEveryStateDimension).toBe(true);
    expect(oneTimeSeriesIsStaticallyNonrecurring).toBe(true);
  });

  it('creates one-time missions as a nonrecurring series plus one stable occurrence', () => {
    const mission = createOneTimeMission({
      series: {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Pay rent',
      },
      occurrence: {
        id: '22222222-2222-4222-8222-222222222222',
        schedule: validSchedule,
        ...validStates,
      },
    });

    expect(mission.series).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Pay rent',
      recurrence: null,
    });
    expect(mission.occurrence.seriesId).toBe(mission.series.id);
    expect(mission.occurrence.id).toBe('22222222-2222-4222-8222-222222222222');
    expect(mission.series).not.toHaveProperty('completionState');
    expect(mission.series).not.toHaveProperty('evidenceState');
    expect(mission.series).not.toHaveProperty('rewardEligibility');
    expect(mission.series).not.toHaveProperty('rewardIssuance');
    expect(mission.series).not.toHaveProperty('storyState');
  });

  it('keeps completion, evidence, reward, and Story state on the occurrence only', () => {
    const series = createMissionSeries({
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Study Korean',
      recurrence: null,
    });
    const occurrence = createMissionOccurrence({
      id: '44444444-4444-4444-8444-444444444444',
      seriesId: series.id,
      schedule: validSchedule,
      ...validStates,
      completionState: 'completed',
      evidenceState: 'accepted',
      rewardEligibility: 'eligible',
      rewardIssuance: 'issued',
      storyState: 'draft',
    });

    expect(occurrence).toMatchObject({
      seriesId: series.id,
      completionState: 'completed',
      evidenceState: 'accepted',
      rewardEligibility: 'eligible',
      rewardIssuance: 'issued',
      storyState: 'draft',
    });
    expect(series).toEqual({
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Study Korean',
      recurrence: null,
    });
  });

  it('rejects invalid identifiers, blank titles, invalid schedules, and invalid state dimensions', () => {
    expect(() =>
      createMissionSeries({ id: 'not-a-uuid', title: 'Valid title', recurrence: null }),
    ).toThrow(/series id/i);
    expect(() =>
      createMissionSeries({
        id: '55555555-5555-4555-8555-555555555555',
        title: '   ',
        recurrence: null,
      }),
    ).toThrow(/title/i);
    expect(() =>
      createMissionOccurrence({
        id: '66666666-6666-4666-8666-666666666666',
        seriesId: '55555555-5555-4555-8555-555555555555',
        schedule: { ...validSchedule, finishInstant: validSchedule.startInstant },
        ...validStates,
      }),
    ).toThrow(/finish/i);
    expect(() =>
      createMissionOccurrence({
        id: '77777777-7777-4777-8777-777777777777',
        seriesId: '55555555-5555-4555-8555-555555555555',
        schedule: validSchedule,
        ...validStates,
        completionState: 'everything-at-once' as never,
      }),
    ).toThrow(/completion state/i);
  });
});
