import { describe, expect, it } from 'vitest';

import {
  domainWeekStartFromRegionalFirstWeekday,
  orderedDomainWeekdays,
} from './calendar-region.js';

describe('Calendar regional week-start adapter', () => {
  it('converts Sunday-start and Monday-start platform calendars into domain weekdays', () => {
    expect(domainWeekStartFromRegionalFirstWeekday(1)).toBe(0);
    expect(domainWeekStartFromRegionalFirstWeekday(2)).toBe(1);
  });

  it('falls back to Monday for missing or invalid platform values', () => {
    expect(domainWeekStartFromRegionalFirstWeekday(undefined)).toBe(1);
    expect(domainWeekStartFromRegionalFirstWeekday(0)).toBe(1);
    expect(domainWeekStartFromRegionalFirstWeekday(8)).toBe(1);
  });

  it('orders weekday choices from the regional domain week start', () => {
    expect(orderedDomainWeekdays(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(orderedDomainWeekdays(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});
