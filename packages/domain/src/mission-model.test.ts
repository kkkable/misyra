import { describe, expect, it } from 'vitest';

type DomainModule = typeof import('./index.js');
type RequiredFactoryName =
  'createMissionSeries' | 'createMissionOccurrence' | 'createOneTimeMission';
type FactoryReturn<Name extends string> =
  DomainModule extends Record<Name, infer Factory>
    ? Factory extends (...args: infer _Arguments) => infer Result
      ? Result
      : never
    : never;
type OccurrenceOnlyStateKey =
  'completionState' | 'evidenceState' | 'rewardEligibility' | 'rewardIssuance' | 'storyState';
type RequiredOccurrenceStateKey =
  | 'scheduleState'
  | OccurrenceOnlyStateKey
  | 'calendarSource'
  | 'fieldOwnership'
  | 'synchronizationState'
  | 'deletionState';
type SeriesReturn = FactoryReturn<'createMissionSeries'>;
type OccurrenceReturn = FactoryReturn<'createMissionOccurrence'>;
type OneTimeReturn = FactoryReturn<'createOneTimeMission'>;
type OneTimeRecurrence = OneTimeReturn extends { series: { recurrence: infer Recurrence } }
  ? Recurrence
  : never;

const requiredFactoriesExist: Exclude<RequiredFactoryName, keyof DomainModule> extends never
  ? true
  : false = true;
const seriesOwnsNoOccurrenceState: [SeriesReturn] extends [never]
  ? false
  : Extract<keyof SeriesReturn, OccurrenceOnlyStateKey> extends never
    ? true
    : false = true;
const occurrenceOwnsEveryStateDimension: [OccurrenceReturn] extends [never]
  ? false
  : Exclude<RequiredOccurrenceStateKey, keyof OccurrenceReturn> extends never
    ? true
    : false = true;
const oneTimeSeriesIsStaticallyNonrecurring: [OneTimeRecurrence] extends [never]
  ? false
  : [OneTimeRecurrence] extends [null]
    ? [null] extends [OneTimeRecurrence]
      ? true
      : false
    : false = true;

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

type DomainFactory = (input: Record<string, unknown>) => unknown;

function requireFactory(module: Record<string, unknown>, name: RequiredFactoryName): DomainFactory {
  const factory = module[name];
  if (typeof factory !== 'function') {
    throw new TypeError(`Missing required domain factory: ${name}`);
  }
  return factory as DomainFactory;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Expected a domain record.');
  }
  return value as Record<string, unknown>;
}

async function loadFactories() {
  const module = (await import('./index.js')) as Record<string, unknown>;
  return {
    createMissionSeries: requireFactory(module, 'createMissionSeries'),
    createMissionOccurrence: requireFactory(module, 'createMissionOccurrence'),
    createOneTimeMission: requireFactory(module, 'createOneTimeMission'),
  };
}

describe('MTS-013 mission series and occurrence contract', () => {
  it('keeps the required type-level separation and independent state dimensions', () => {
    expect(requiredFactoriesExist).toBe(true);
    expect(seriesOwnsNoOccurrenceState).toBe(true);
    expect(occurrenceOwnsEveryStateDimension).toBe(true);
    expect(oneTimeSeriesIsStaticallyNonrecurring).toBe(true);
  });

  it('creates one-time missions as a nonrecurring series plus one stable occurrence', async () => {
    const { createOneTimeMission } = await loadFactories();
    const mission = asRecord(
      createOneTimeMission({
        series: {
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Pay rent',
        },
        occurrence: {
          id: '22222222-2222-4222-8222-222222222222',
          schedule: validSchedule,
          ...validStates,
        },
      }),
    );
    const series = asRecord(mission.series);
    const occurrence = asRecord(mission.occurrence);

    expect(series).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Pay rent',
      recurrence: null,
    });
    expect(occurrence.seriesId).toBe(series.id);
    expect(occurrence.id).toBe('22222222-2222-4222-8222-222222222222');
    expect(series).not.toHaveProperty('completionState');
    expect(series).not.toHaveProperty('evidenceState');
    expect(series).not.toHaveProperty('rewardEligibility');
    expect(series).not.toHaveProperty('rewardIssuance');
    expect(series).not.toHaveProperty('storyState');
  });

  it('keeps completion, evidence, reward, and Story state on the occurrence only', async () => {
    const { createMissionOccurrence, createMissionSeries } = await loadFactories();
    const series = asRecord(
      createMissionSeries({
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Study Korean',
        recurrence: null,
      }),
    );
    const occurrence = asRecord(
      createMissionOccurrence({
        id: '44444444-4444-4444-8444-444444444444',
        seriesId: series.id,
        schedule: validSchedule,
        ...validStates,
        completionState: 'completed',
        evidenceState: 'accepted',
        rewardEligibility: 'eligible',
        rewardIssuance: 'issued',
        storyState: 'draft',
      }),
    );

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

  it('drops unrecognized aggregate status fields from canonical occurrences', async () => {
    const { createMissionOccurrence } = await loadFactories();
    const occurrence = asRecord(
      createMissionOccurrence({
        id: '88888888-8888-4888-8888-888888888888',
        seriesId: '55555555-5555-4555-8555-555555555555',
        schedule: validSchedule,
        ...validStates,
        status: 'completed-and-rewarded',
      }),
    );

    expect(occurrence).not.toHaveProperty('status');
    expect(Object.keys(occurrence).sort()).toEqual(
      [
        'calendarSource',
        'completionState',
        'deletionState',
        'evidenceState',
        'fieldOwnership',
        'id',
        'rewardEligibility',
        'rewardIssuance',
        'schedule',
        'scheduleState',
        'seriesId',
        'storyState',
        'synchronizationState',
      ].sort(),
    );
  });

  it('rejects invalid identifiers, blank titles, invalid schedules, and invalid state dimensions', async () => {
    const { createMissionOccurrence, createMissionSeries } = await loadFactories();

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
        completionState: 'everything-at-once',
      }),
    ).toThrow(/completion state/i);
  });
});
