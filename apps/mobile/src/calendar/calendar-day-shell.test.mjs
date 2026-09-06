import { describe, expect, it } from 'vitest';

import {
  buildSevenDayStrip,
  resolveCalendarLaunch,
  resolveInitialCalendarDate,
  resolveResponsiveCalendarLayout,
  shouldShowTodayButton,
} from './calendar-day-shell.js';

describe('MTS-040 Calendar day shell positioning', () => {
  it('opens a fresh launch on today at the current minute', () => {
    expect(
      resolveCalendarLaunch({
        selectedDate: '2026-09-06',
        today: '2026-09-06',
        currentMinute: 8 * 60 + 37,
        firstTimedMissionMinute: 9 * 60,
      }),
    ).toEqual({ date: '2026-09-06', minute: 517, reason: 'current-time' });
  });

  it('preserves the prior position when returning from background', () => {
    expect(
      resolveCalendarLaunch({
        selectedDate: '2026-09-06',
        today: '2026-09-06',
        currentMinute: 600,
        preservedMinute: 742,
        returningFromBackground: true,
      }),
    ).toEqual({ date: '2026-09-06', minute: 742, reason: 'preserved' });
  });

  it('opens another date at its first timed mission or 08:00 when empty', () => {
    expect(
      resolveCalendarLaunch({
        selectedDate: '2026-09-07',
        today: '2026-09-06',
        currentMinute: 600,
        firstTimedMissionMinute: 665,
      }).minute,
    ).toBe(665);
    expect(
      resolveCalendarLaunch({
        selectedDate: '2026-09-08',
        today: '2026-09-06',
        currentMinute: 600,
      }).minute,
    ).toBe(480);
  });

  it('shows Today only while another date is selected', () => {
    expect(shouldShowTodayButton('2026-09-06', '2026-09-06')).toBe(false);
    expect(shouldShowTodayButton('2026-09-05', '2026-09-06')).toBe(true);
  });
});

describe('MTS-040 regional seven-day strip', () => {
  it('starts the visible week on Sunday when the regional first weekday is Sunday', () => {
    const days = buildSevenDayStrip('2026-09-09', 1);
    expect(days.map((day) => day.date)).toEqual([
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ]);
  });

  it('starts the visible week on Monday when the regional first weekday is Monday', () => {
    const days = buildSevenDayStrip('2026-09-09', 2);
    expect(days[0].date).toBe('2026-09-07');
    expect(days[6].date).toBe('2026-09-13');
    expect(days.find((day) => day.date === '2026-09-09')?.selected).toBe(true);
  });
});

describe('MTS-040 deep links and responsive contracts', () => {
  it('uses a valid deep-link date and otherwise falls back to today', () => {
    expect(resolveInitialCalendarDate('2026-12-24', '2026-09-06')).toBe('2026-12-24');
    expect(resolveInitialCalendarDate('not-a-date', '2026-09-06')).toBe('2026-09-06');
  });

  it('keeps the seven-day strip viable on narrow and wide portrait widths', () => {
    expect(resolveResponsiveCalendarLayout(320)).toMatchInlineSnapshot(`
      {
        "compactHeader": true,
        "dayCellWidth": 40,
        "horizontalPadding": 12,
      }
    `);
    expect(resolveResponsiveCalendarLayout(430)).toMatchInlineSnapshot(`
      {
        "compactHeader": false,
        "dayCellWidth": 52,
        "horizontalPadding": 16,
      }
    `);
  });
});
