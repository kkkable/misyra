import { describe, expect, it } from 'vitest';

import {
  orderWeekdaysFromRegionStart,
  platformFirstWeekdayToDomain,
} from './calendar-region-runtime.js';

describe('MTS-051 regional week start', () => {
  it('converts platform Sunday/Monday/Saturday starts to the domain 0..6 representation', () => {
    expect(platformFirstWeekdayToDomain(1)).toBe(0);
    expect(platformFirstWeekdayToDomain(2)).toBe(1);
    expect(platformFirstWeekdayToDomain(7)).toBe(6);
    expect(platformFirstWeekdayToDomain(undefined)).toBe(1);
  });

  it('orders weekday choices from the current phone-region week start', () => {
    expect(orderWeekdaysFromRegionStart(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(orderWeekdaysFromRegionStart(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});
