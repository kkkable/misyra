import { describe, expect, it } from 'vitest';

import { expandRecurrenceDates } from './recurrence-expansion.js';

describe('MTS-051 regional every-N-week phasing', () => {
  it('phases a two-week Sunday recurrence from a Sunday-start phone region', () => {
    expect(
      expandRecurrenceDates({
        anchorLocalDate: '2026-09-09',
        recurrence: {
          pattern: { type: 'weekly', interval: 2, weekdays: [0], weekStartsOn: 0 },
          end: { type: 'count', occurrenceCount: 2 },
        },
        windowStartLocalDate: '2026-09-09',
        windowEndLocalDate: '2026-10-31',
      }),
    ).toEqual(['2026-09-20', '2026-10-04']);
  });

  it('phases the same two-week Sunday recurrence differently in a Monday-start phone region', () => {
    expect(
      expandRecurrenceDates({
        anchorLocalDate: '2026-09-09',
        recurrence: {
          pattern: { type: 'weekly', interval: 2, weekdays: [0], weekStartsOn: 1 },
          end: { type: 'count', occurrenceCount: 2 },
        },
        windowStartLocalDate: '2026-09-09',
        windowEndLocalDate: '2026-10-31',
      }),
    ).toEqual(['2026-09-13', '2026-09-27']);
  });
});
