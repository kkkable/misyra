import { describe, expect, it } from 'vitest';

import { expandRecurrenceDates } from './index.js';

describe('MTS-014 recurrence boundedness contract', () => {
  it('rejects recurrence intervals that cannot be incremented safely', () => {
    expect(() =>
      expandRecurrenceDates({
        anchorLocalDate: '2026-03-04',
        recurrence: {
          pattern: { type: 'daily', interval: Number.MAX_SAFE_INTEGER },
          end: { type: 'never' },
        },
        windowStartLocalDate: '2026-01-01',
        windowEndLocalDate: '2026-01-01',
      }),
    ).toThrow(/safe positive integer/i);
  });

  it('terminates daily expansion when a later candidate exceeds the Date range', () => {
    expect(
      expandRecurrenceDates({
        anchorLocalDate: '2026-03-04',
        recurrence: {
          pattern: { type: 'daily', interval: 1_000_000_000 },
          end: { type: 'never' },
        },
        windowStartLocalDate: '2026-03-01',
        windowEndLocalDate: '2030-12-31',
      }),
    ).toEqual(['2026-03-04']);
  });

  it('terminates weekly expansion when a later calendar-week phase exceeds the Date range', () => {
    expect(
      expandRecurrenceDates({
        anchorLocalDate: '2026-03-04',
        recurrence: {
          pattern: {
            type: 'weekly',
            interval: 1_000_000_000,
            weekdays: [3],
            weekStartsOn: 1,
          },
          end: { type: 'never' },
        },
        windowStartLocalDate: '2026-03-01',
        windowEndLocalDate: '2030-12-31',
      }),
    ).toEqual(['2026-03-04']);
  });
});
