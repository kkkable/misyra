import { describe, expect, it } from 'vitest';

import * as domainModule from './index.js';
import { createMissionOccurrence, createMissionSeries, type MissionOccurrence } from './index.js';

type RecurringSeriesScope = 'this_occurrence' | 'this_and_future' | 'entire_series';
type RecurringScopeOperation = 'edit' | 'delete';

interface ScopePlanInput {
  readonly series: ReturnType<typeof createMissionSeries>;
  readonly occurrences: readonly MissionOccurrence[];
  readonly selectedOccurrenceId: string;
  readonly scope: RecurringSeriesScope;
  readonly operation: RecurringScopeOperation;
}

interface ScopePlan {
  readonly affectedOccurrenceIds: readonly string[];
  readonly preservedOccurrenceIds: readonly string[];
  readonly retiredOccurrenceIds: readonly string[];
  readonly splitBoundary: null | {
    readonly occurrenceId: string;
    readonly localStart: string;
    readonly startInstant: string;
  };
}

type ScopePlanner = (input: ScopePlanInput) => ScopePlan;

function isScopePlanner(value: unknown): value is ScopePlanner {
  return typeof value === 'function';
}

function requireScopePlanner(): ScopePlanner {
  const module = domainModule as unknown as Record<string, unknown>;
  const planner = module['planRecurringSeriesScope'];
  if (!isScopePlanner(planner)) {
    throw new TypeError('Missing required domain function: planRecurringSeriesScope');
  }
  return planner;
}

const series = createMissionSeries({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Weekly review',
  recurrence: {
    pattern: { type: 'daily', interval: 1 },
    end: { type: 'never' },
  },
});

const baseStates = {
  scheduleState: 'scheduled',
  evidenceState: 'not_submitted',
  rewardEligibility: 'undetermined',
  rewardIssuance: 'not_issued',
  calendarSource: 'internal',
  fieldOwnership: 'app_owned',
  synchronizationState: 'local_only',
  storyState: 'none',
  deletionState: 'active',
} as const;

function occurrence(
  id: string,
  localStart: string,
  startInstant: string,
  completionState: 'incomplete' | 'completed' = 'incomplete',
  evidenceState: 'not_submitted' | 'accepted' | 'rejected' = 'not_submitted',
): MissionOccurrence {
  const start = new Date(startInstant);
  const finish = new Date(start.getTime() + 30 * 60 * 1000);

  return createMissionOccurrence({
    id,
    seriesId: series.id,
    schedule: {
      localStart,
      localFinish: `${localStart.slice(0, 11)}09:30:00`,
      startInstant,
      finishInstant: finish.toISOString(),
      timeZone: 'Asia/Tokyo',
      timeBehavior: 'local_time',
      allDay: false,
      estimatedEffortMinutes: null,
    },
    ...baseStates,
    completionState,
    evidenceState,
  });
}

const completedPast = occurrence(
  '21111111-1111-4111-8111-111111111111',
  '2026-09-01T09:00:00',
  '2026-09-01T00:00:00.000Z',
  'completed',
  'accepted',
);
const selected = occurrence(
  '31111111-1111-4111-8111-111111111111',
  '2026-09-02T09:00:00',
  '2026-09-02T00:00:00.000Z',
);
const completedFuture = occurrence(
  '41111111-1111-4111-8111-111111111111',
  '2026-09-03T09:00:00',
  '2026-09-03T00:00:00.000Z',
  'completed',
  'rejected',
);
const unfinishedFuture = occurrence(
  '51111111-1111-4111-8111-111111111111',
  '2026-09-04T09:00:00',
  '2026-09-04T00:00:00.000Z',
);

const occurrences = [unfinishedFuture, completedFuture, selected, completedPast] as const;

function affectedFor(scope: RecurringSeriesScope): ScopePlan {
  return requireScopePlanner()({
    series,
    occurrences,
    selectedOccurrenceId: selected.id,
    scope,
    operation: 'edit',
  });
}

describe('MTS-015 recurring-series scope operations', () => {
  it('applies the edit scope matrix while preserving completed history', () => {
    expect(affectedFor('this_occurrence')).toMatchObject({
      affectedOccurrenceIds: [selected.id],
      preservedOccurrenceIds: [completedPast.id, completedFuture.id, unfinishedFuture.id],
      retiredOccurrenceIds: [],
      splitBoundary: null,
    });

    expect(affectedFor('this_and_future')).toMatchObject({
      affectedOccurrenceIds: [selected.id, unfinishedFuture.id],
      preservedOccurrenceIds: [completedPast.id, completedFuture.id],
      retiredOccurrenceIds: [],
      splitBoundary: {
        occurrenceId: selected.id,
        localStart: selected.schedule.localStart,
        startInstant: selected.schedule.startInstant,
      },
    });

    expect(affectedFor('entire_series')).toMatchObject({
      affectedOccurrenceIds: [selected.id, unfinishedFuture.id],
      preservedOccurrenceIds: [completedPast.id, completedFuture.id],
      retiredOccurrenceIds: [],
      splitBoundary: null,
    });
  });

  it('retires only applicable unfinished identifiers for deletion', () => {
    const plan = requireScopePlanner()({
      series,
      occurrences,
      selectedOccurrenceId: selected.id,
      scope: 'this_and_future',
      operation: 'delete',
    });

    expect(plan.affectedOccurrenceIds).toEqual([selected.id, unfinishedFuture.id]);
    expect(plan.retiredOccurrenceIds).toEqual([selected.id, unfinishedFuture.id]);
    expect(plan.preservedOccurrenceIds).toEqual([completedPast.id, completedFuture.id]);
  });

  it('uses the selected occurrence as a deterministic split boundary independent of input order', () => {
    const plan = affectedFor('this_and_future');

    expect(plan.splitBoundary).toEqual({
      occurrenceId: selected.id,
      localStart: '2026-09-02T09:00:00',
      startInstant: '2026-09-02T00:00:00.000Z',
    });
    expect(plan.affectedOccurrenceIds).toEqual([selected.id, unfinishedFuture.id]);
  });

  it('never mutates or propagates completion and evidence state between occurrences', () => {
    const before = occurrences.map((item) => ({
      id: item.id,
      completionState: item.completionState,
      evidenceState: item.evidenceState,
    }));

    affectedFor('entire_series');

    expect(
      occurrences.map((item) => ({
        id: item.id,
        completionState: item.completionState,
        evidenceState: item.evidenceState,
      })),
    ).toEqual(before);
    expect(completedPast.completionState).toBe('completed');
    expect(completedPast.evidenceState).toBe('accepted');
    expect(completedFuture.completionState).toBe('completed');
    expect(completedFuture.evidenceState).toBe('rejected');
  });

  it('rejects nonrecurring aggregates, foreign occurrences, duplicate ids, and missing selections', () => {
    const plan = requireScopePlanner();
    const oneTime = createMissionSeries({
      id: '61111111-1111-4111-8111-111111111111',
      title: 'One time',
      recurrence: null,
    });
    const foreign = createMissionOccurrence({
      ...selected,
      id: '71111111-1111-4111-8111-111111111111',
      seriesId: '81111111-1111-4111-8111-111111111111',
    });

    expect(() =>
      plan({
        series: oneTime,
        occurrences: [selected],
        selectedOccurrenceId: selected.id,
        scope: 'entire_series',
        operation: 'edit',
      }),
    ).toThrow(/recurring series/i);

    expect(() =>
      plan({
        series,
        occurrences: [selected, foreign],
        selectedOccurrenceId: selected.id,
        scope: 'entire_series',
        operation: 'edit',
      }),
    ).toThrow(/series/i);

    expect(() =>
      plan({
        series,
        occurrences: [selected, selected],
        selectedOccurrenceId: selected.id,
        scope: 'entire_series',
        operation: 'delete',
      }),
    ).toThrow(/duplicate/i);

    expect(() =>
      plan({
        series,
        occurrences,
        selectedOccurrenceId: '91111111-1111-4111-8111-111111111111',
        scope: 'this_occurrence',
        operation: 'edit',
      }),
    ).toThrow(/selected occurrence/i);
  });
});
