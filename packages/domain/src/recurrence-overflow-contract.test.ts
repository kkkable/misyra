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
});
