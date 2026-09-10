import { describe, expect, it } from 'vitest';

import {
  createMissionOccurrence,
  createMissionSeries,
  recurrenceForThisAndFutureSplit,
  type MissionOccurrence,
} from './index.js';

const seriesId = '11111111-1111-4111-8111-111111111111';

function occurrence(id: string, localDate: string): MissionOccurrence {
  return createMissionOccurrence({
    id,
    seriesId,
    schedule: {
      localStart: `${localDate}T09:00:00`,
      localFinish: `${localDate}T09:30:00`,
      startInstant: `${localDate}T00:00:00.000Z`,
      finishInstant: `${localDate}T00:30:00.000Z`,
      timeZone: 'Asia/Tokyo',
      timeBehavior: 'local_time',
      allDay: false,
      estimatedEffortMinutes: null,
    },
    scheduleState: 'scheduled',
    completionState: 'incomplete',
    evidenceState: 'not_submitted',
    rewardEligibility: 'eligible',
    rewardIssuance: 'not_issued',
    calendarSource: 'internal',
    fieldOwnership: 'app_owned',
    synchronizationState: 'synced',
    storyState: 'none',
    deletionState: 'active',
  });
}

const occurrences = [
  occurrence('21111111-1111-4111-8111-111111111111', '2026-09-01'),
  occurrence('31111111-1111-4111-8111-111111111111', '2026-09-02'),
  occurrence('41111111-1111-4111-8111-111111111111', '2026-09-03'),
  occurrence('51111111-1111-4111-8111-111111111111', '2026-09-04'),
] as const;

describe('MTS-052 count-ended recurring splits', () => {
  it('reduces the new series count by the number of created occurrences before the split boundary', () => {
    const series = createMissionSeries({
      id: seriesId,
      title: 'Six reviews',
      recurrence: {
        pattern: { type: 'daily', interval: 1 },
        end: { type: 'count', occurrenceCount: 6 },
      },
    });

    expect(
      recurrenceForThisAndFutureSplit(series, occurrences, occurrences[1].id),
    ).toEqual({
      pattern: { type: 'daily', interval: 1 },
      end: { type: 'count', occurrenceCount: 5 },
    });

    expect(
      recurrenceForThisAndFutureSplit(series, occurrences, occurrences[3].id),
    ).toEqual({
      pattern: { type: 'daily', interval: 1 },
      end: { type: 'count', occurrenceCount: 3 },
    });
  });

  it('preserves never/date endings because their boundary is already absolute', () => {
    const neverSeries = createMissionSeries({
      id: seriesId,
      title: 'Forever',
      recurrence: {
        pattern: { type: 'daily', interval: 1 },
        end: { type: 'never' },
      },
    });
    expect(
      recurrenceForThisAndFutureSplit(neverSeries, occurrences, occurrences[1].id),
    ).toEqual(neverSeries.recurrence);

    const dateSeries = createMissionSeries({
      id: seriesId,
      title: 'Until date',
      recurrence: {
        pattern: { type: 'daily', interval: 1 },
        end: { type: 'date', inclusiveLocalDate: '2026-09-30' },
      },
    });
    expect(
      recurrenceForThisAndFutureSplit(dateSeries, occurrences, occurrences[1].id),
    ).toEqual(dateSeries.recurrence);
  });
});
