import { describe, expect, it } from 'vitest';

import {
  createMissionOccurrence,
  createMissionSeries,
  planRecurringSeriesScope,
  type DeletionState,
  type MissionOccurrence,
} from './index.js';

const series = createMissionSeries({
  id: 'a1111111-1111-4111-8111-111111111111',
  title: 'Retired occurrence contract',
  recurrence: {
    pattern: { type: 'daily', interval: 1 },
    end: { type: 'never' },
  },
});

function occurrence(
  id: string,
  startInstant: string,
  deletionState: DeletionState,
): MissionOccurrence {
  const start = new Date(startInstant);
  const finish = new Date(start.getTime() + 30 * 60 * 1000);
  const localDate = startInstant.slice(0, 10);

  return createMissionOccurrence({
    id,
    seriesId: series.id,
    schedule: {
      localStart: `${localDate}T09:00:00`,
      localFinish: `${localDate}T09:30:00`,
      startInstant,
      finishInstant: finish.toISOString(),
      timeZone: 'Asia/Tokyo',
      timeBehavior: 'local_time',
      allDay: false,
      estimatedEffortMinutes: null,
    },
    scheduleState: 'scheduled',
    completionState: 'incomplete',
    evidenceState: 'not_submitted',
    rewardEligibility: 'undetermined',
    rewardIssuance: 'not_issued',
    calendarSource: 'internal',
    fieldOwnership: 'app_owned',
    synchronizationState: 'local_only',
    storyState: 'none',
    deletionState,
  });
}

const selected = occurrence(
  'b1111111-1111-4111-8111-111111111111',
  '2026-09-05T00:00:00.000Z',
  'active',
);
const alreadyDeleted = occurrence(
  'c1111111-1111-4111-8111-111111111111',
  '2026-09-06T00:00:00.000Z',
  'deleted',
);

describe('MTS-015 retired occurrence identifiers', () => {
  it('preserves an existing tombstone across later edit and delete plans', () => {
    const editPlan = planRecurringSeriesScope({
      series,
      occurrences: [alreadyDeleted, selected],
      selectedOccurrenceId: selected.id,
      scope: 'entire_series',
      operation: 'edit',
    });

    expect(editPlan.affectedOccurrenceIds).toEqual([selected.id]);
    expect(editPlan.preservedOccurrenceIds).toContain(alreadyDeleted.id);
    expect(editPlan.retiredOccurrenceIds).toEqual([alreadyDeleted.id]);

    const deletePlan = planRecurringSeriesScope({
      series,
      occurrences: [alreadyDeleted, selected],
      selectedOccurrenceId: selected.id,
      scope: 'entire_series',
      operation: 'delete',
    });

    expect(deletePlan.affectedOccurrenceIds).toEqual([selected.id]);
    expect(deletePlan.preservedOccurrenceIds).toContain(alreadyDeleted.id);
    expect(deletePlan.retiredOccurrenceIds).toEqual([alreadyDeleted.id, selected.id]);
  });
});
