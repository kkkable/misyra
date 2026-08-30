import { describe, expect, it } from 'vitest';

import { createMissionSeries, expandRecurrenceDates, type MissionRecurrence } from './index.js';

interface Case {
  readonly name: string;
  readonly anchorLocalDate: string;
  readonly recurrence: MissionRecurrence;
  readonly windowStartLocalDate: string;
  readonly windowEndLocalDate: string;
  readonly expected: readonly string[];
}

const corpus: readonly Case[] = [
  {
    name: 'daily interval',
    anchorLocalDate: '2026-03-01',
    recurrence: {
      pattern: { type: 'daily', interval: 2 },
      end: { type: 'never' },
    },
    windowStartLocalDate: '2026-03-01',
    windowEndLocalDate: '2026-03-09',
    expected: ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07', '2026-03-09'],
  },
  {
    name: 'weekly interval with selected weekdays',
    anchorLocalDate: '2026-03-02',
    recurrence: {
      pattern: { type: 'weekly', interval: 2, weekdays: [1, 3], weekStartsOn: 1 },
      end: { type: 'never' },
    },
    windowStartLocalDate: '2026-03-02',
    windowEndLocalDate: '2026-03-31',
    expected: ['2026-03-02', '2026-03-04', '2026-03-16', '2026-03-18', '2026-03-30'],
  },
  {
    name: 'weekly interval phases calendar weeks from a mid-week anchor',
    anchorLocalDate: '2026-03-04',
    recurrence: {
      pattern: { type: 'weekly', interval: 2, weekdays: [1, 3], weekStartsOn: 1 },
      end: { type: 'never' },
    },
    windowStartLocalDate: '2026-03-01',
    windowEndLocalDate: '2026-04-05',
    expected: ['2026-03-04', '2026-03-16', '2026-03-18', '2026-03-30', '2026-04-01'],
  },
  {
    name: 'Sunday-start weekly phase skips a pre-anchor Sunday in the anchor week',
    anchorLocalDate: '2026-03-04',
    recurrence: {
      pattern: { type: 'weekly', interval: 2, weekdays: [0], weekStartsOn: 0 },
      end: { type: 'never' },
    },
    windowStartLocalDate: '2026-03-01',
    windowEndLocalDate: '2026-03-31',
    expected: ['2026-03-15', '2026-03-29'],
  },
  {
    name: 'Monday-start weekly phase includes Sunday at the end of the anchor week',
    anchorLocalDate: '2026-03-04',
    recurrence: {
      pattern: { type: 'weekly', interval: 2, weekdays: [0], weekStartsOn: 1 },
      end: { type: 'never' },
    },
    windowStartLocalDate: '2026-03-01',
    windowEndLocalDate: '2026-03-31',
    expected: ['2026-03-08', '2026-03-22'],
  },
  {
    name: 'monthly same date skips invalid dates',
    anchorLocalDate: '2026-01-31',
    recurrence: {
      pattern: { type: 'monthly-date', interval: 1, dayOfMonth: 31 },
      end: { type: 'never' },
    },
    windowStartLocalDate: '2026-01-01',
    windowEndLocalDate: '2026-05-31',
    expected: ['2026-01-31', '2026-03-31', '2026-05-31'],
  },
  {
    name: 'monthly 30th skips February and respects interval months',
    anchorLocalDate: '2026-01-30',
    recurrence: {
      pattern: { type: 'monthly-date', interval: 1, dayOfMonth: 30 },
      end: { type: 'never' },
    },
    windowStartLocalDate: '2026-01-01',
    windowEndLocalDate: '2026-04-30',
    expected: ['2026-01-30', '2026-03-30', '2026-04-30'],
  },
  {
    name: 'monthly 29th skips a non-leap February',
    anchorLocalDate: '2026-01-29',
    recurrence: {
      pattern: { type: 'monthly-date', interval: 1, dayOfMonth: 29 },
      end: { type: 'never' },
    },
    windowStartLocalDate: '2026-01-01',
    windowEndLocalDate: '2026-03-31',
    expected: ['2026-01-29', '2026-03-29'],
  },
  {
    name: 'monthly interval advances by whole anchor-relative months',
    anchorLocalDate: '2026-01-15',
    recurrence: {
      pattern: { type: 'monthly-date', interval: 2, dayOfMonth: 15 },
      end: { type: 'never' },
    },
    windowStartLocalDate: '2026-01-01',
    windowEndLocalDate: '2026-07-31',
    expected: ['2026-01-15', '2026-03-15', '2026-05-15', '2026-07-15'],
  },
  {
    name: 'monthly ordinal weekday',
    anchorLocalDate: '2026-01-13',
    recurrence: {
      pattern: { type: 'monthly-ordinal', interval: 1, ordinal: 2, weekday: 2 },
      end: { type: 'never' },
    },
    windowStartLocalDate: '2026-01-01',
    windowEndLocalDate: '2026-03-31',
    expected: ['2026-01-13', '2026-02-10', '2026-03-10'],
  },
  {
    name: 'yearly same date skips non-leap years',
    anchorLocalDate: '2024-02-29',
    recurrence: {
      pattern: { type: 'yearly-date', interval: 1, month: 2, day: 29 },
      end: { type: 'never' },
    },
    windowStartLocalDate: '2024-01-01',
    windowEndLocalDate: '2032-12-31',
    expected: ['2024-02-29', '2028-02-29', '2032-02-29'],
  },
  {
    name: 'yearly interval advances by whole anchor-relative years',
    anchorLocalDate: '2026-06-05',
    recurrence: {
      pattern: { type: 'yearly-date', interval: 2, month: 6, day: 5 },
      end: { type: 'never' },
    },
    windowStartLocalDate: '2026-01-01',
    windowEndLocalDate: '2032-12-31',
    expected: ['2026-06-05', '2028-06-05', '2030-06-05', '2032-06-05'],
  },
  {
    name: 'yearly ordinal weekday',
    anchorLocalDate: '2026-05-25',
    recurrence: {
      pattern: { type: 'yearly-ordinal', interval: 1, month: 5, ordinal: -1, weekday: 1 },
      end: { type: 'never' },
    },
    windowStartLocalDate: '2026-01-01',
    windowEndLocalDate: '2028-12-31',
    expected: ['2026-05-25', '2027-05-31', '2028-05-29'],
  },
];

function expandWith(recurrence: MissionRecurrence) {
  return expandRecurrenceDates({
    anchorLocalDate: '2026-03-04',
    recurrence,
    windowStartLocalDate: '2026-03-01',
    windowEndLocalDate: '2026-04-30',
  });
}

describe('MTS-014 recurrence expansion', () => {
  for (const entry of corpus) {
    it(`expands ${entry.name} deterministically`, () => {
      expect(
        expandRecurrenceDates({
          anchorLocalDate: entry.anchorLocalDate,
          recurrence: entry.recurrence,
          windowStartLocalDate: entry.windowStartLocalDate,
          windowEndLocalDate: entry.windowEndLocalDate,
        }),
      ).toEqual(entry.expected);
    });
  }

  it('persists the weekly week-start phase on the mission series', () => {
    const series = createMissionSeries({
      id: '99999999-9999-4999-8999-999999999999',
      title: 'Regional weekly phase',
      recurrence: {
        pattern: { type: 'weekly', interval: 2, weekdays: [0, 3], weekStartsOn: 1 },
        end: { type: 'never' },
      },
    });

    expect(series.recurrence?.pattern).toEqual({
      type: 'weekly',
      interval: 2,
      weekdays: [0, 3],
      weekStartsOn: 1,
    });
  });

  it('keeps local daily recurrence continuous across a DST-adjacent calendar boundary', () => {
    expect(
      expandRecurrenceDates({
        anchorLocalDate: '2026-03-07',
        recurrence: {
          pattern: { type: 'daily', interval: 1 },
          end: { type: 'never' },
        },
        windowStartLocalDate: '2026-03-07',
        windowEndLocalDate: '2026-03-10',
      }),
    ).toEqual(['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
  });

  it('treats date endings as inclusive', () => {
    expect(
      expandRecurrenceDates({
        anchorLocalDate: '2026-04-01',
        recurrence: {
          pattern: { type: 'daily', interval: 1 },
          end: { type: 'date', inclusiveLocalDate: '2026-04-03' },
        },
        windowStartLocalDate: '2026-04-01',
        windowEndLocalDate: '2026-04-10',
      }),
    ).toEqual(['2026-04-01', '2026-04-02', '2026-04-03']);
  });

  it('does not count skipped invalid dates toward count endings', () => {
    expect(
      expandRecurrenceDates({
        anchorLocalDate: '2026-01-31',
        recurrence: {
          pattern: { type: 'monthly-date', interval: 1, dayOfMonth: 31 },
          end: { type: 'count', occurrenceCount: 3 },
        },
        windowStartLocalDate: '2026-01-01',
        windowEndLocalDate: '2026-12-31',
      }),
    ).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
  });

  it('applies count endings from the series anchor even when the requested window starts later', () => {
    expect(
      expandRecurrenceDates({
        anchorLocalDate: '2026-01-31',
        recurrence: {
          pattern: { type: 'monthly-date', interval: 1, dayOfMonth: 31 },
          end: { type: 'count', occurrenceCount: 3 },
        },
        windowStartLocalDate: '2026-03-01',
        windowEndLocalDate: '2026-12-31',
      }),
    ).toEqual(['2026-03-31', '2026-05-31']);
  });

  it('honors count endings as a property of actual created occurrences', () => {
    for (let occurrenceCount = 1; occurrenceCount <= 8; occurrenceCount += 1) {
      const dates = expandRecurrenceDates({
        anchorLocalDate: '2026-01-31',
        recurrence: {
          pattern: { type: 'monthly-date', interval: 1, dayOfMonth: 31 },
          end: { type: 'count', occurrenceCount },
        },
        windowStartLocalDate: '2026-01-01',
        windowEndLocalDate: '2030-12-31',
      });

      expect(dates).toHaveLength(occurrenceCount);
      expect(new Set(dates).size).toBe(occurrenceCount);
      expect(dates).toEqual([...dates].sort());
      expect(dates.every((date) => date.endsWith('-31'))).toBe(true);
    }
  });

  it('never returns occurrences outside the requested inclusive window', () => {
    expect(
      expandRecurrenceDates({
        anchorLocalDate: '2026-01-01',
        recurrence: {
          pattern: { type: 'daily', interval: 1 },
          end: { type: 'never' },
        },
        windowStartLocalDate: '2026-06-10',
        windowEndLocalDate: '2026-06-12',
      }),
    ).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);
  });

  it('rejects malformed or impossible local dates', () => {
    expect(() =>
      expandRecurrenceDates({
        anchorLocalDate: '2026-02-30',
        recurrence: {
          pattern: { type: 'daily', interval: 1 },
          end: { type: 'never' },
        },
        windowStartLocalDate: '2026-03-01',
        windowEndLocalDate: '2026-03-31',
      }),
    ).toThrow(/real calendar date/i);
  });

  it('rejects zero and negative recurrence intervals', () => {
    expect(() =>
      expandWith({
        pattern: { type: 'daily', interval: 0 },
        end: { type: 'never' },
      }),
    ).toThrow(/positive integer/i);

    expect(() =>
      expandWith({
        pattern: { type: 'monthly-date', interval: -1, dayOfMonth: 4 },
        end: { type: 'never' },
      }),
    ).toThrow(/positive integer/i);
  });

  it('rejects empty weekly weekday sets and invalid persisted week starts', () => {
    expect(() =>
      expandWith({
        pattern: { type: 'weekly', interval: 1, weekdays: [], weekStartsOn: 1 },
        end: { type: 'never' },
      }),
    ).toThrow(/weekday/i);

    expect(() =>
      expandWith({
        pattern: { type: 'weekly', interval: 1, weekdays: [1], weekStartsOn: 7 },
        end: { type: 'never' },
      }),
    ).toThrow(/week start/i);
  });

  it('rejects invalid ordinals at the runtime boundary', () => {
    const invalidOrdinal = {
      pattern: { type: 'monthly-ordinal', interval: 1, ordinal: 5, weekday: 1 },
      end: { type: 'never' },
    } as unknown as MissionRecurrence;

    expect(() => expandWith(invalidOrdinal)).toThrow(/ordinal/i);
  });

  it('rejects reversed expansion windows', () => {
    expect(() =>
      expandRecurrenceDates({
        anchorLocalDate: '2026-03-04',
        recurrence: {
          pattern: { type: 'daily', interval: 1 },
          end: { type: 'never' },
        },
        windowStartLocalDate: '2026-04-01',
        windowEndLocalDate: '2026-03-31',
      }),
    ).toThrow(/window end/i);
  });
});
