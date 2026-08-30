import type { MissionRecurrence, RecurrencePattern } from './mission-model.js';

export interface RecurrenceExpansionInput {
  readonly anchorLocalDate: string;
  readonly recurrence: MissionRecurrence;
  readonly windowStartLocalDate: string;
  readonly windowEndLocalDate: string;
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const ORDINALS = new Set([1, 2, 3, 4, -1]);

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a safe positive integer.`);
  }
}

function assertIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be an integer from ${String(minimum)} to ${String(maximum)}.`,
    );
  }
}

function parseLocalDate(value: string, label: string): Date {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (match === null) {
    throw new TypeError(`${label} must use YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError(`${label} must be a real calendar date.`);
  }

  return date;
}

function formatLocalDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function makeDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function addMonths(year: number, month: number, months: number): { year: number; month: number } {
  const absoluteMonth = year * 12 + (month - 1) + months;
  return {
    year: Math.floor(absoluteMonth / 12),
    month: (absoluteMonth % 12) + 1,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function ordinalWeekdayDate(
  year: number,
  month: number,
  ordinal: 1 | 2 | 3 | 4 | -1,
  weekday: number,
): Date | null {
  if (ordinal === -1) {
    const lastDay = daysInMonth(year, month);
    const lastDate = makeDate(year, month, lastDay);
    if (lastDate === null) {
      return null;
    }
    const offset = (lastDate.getUTCDay() - weekday + 7) % 7;
    return makeDate(year, month, lastDay - offset);
  }

  const firstDate = makeDate(year, month, 1);
  if (firstDate === null) {
    return null;
  }
  const firstOffset = (weekday - firstDate.getUTCDay() + 7) % 7;
  const day = 1 + firstOffset + (ordinal - 1) * 7;
  return makeDate(year, month, day);
}

function validatePattern(pattern: RecurrencePattern): void {
  switch (pattern.type) {
    case 'daily':
      assertPositiveInteger(pattern.interval, 'Recurrence interval');
      break;
    case 'weekly':
      assertPositiveInteger(pattern.interval, 'Recurrence interval');
      if (pattern.weekdays.length === 0) {
        throw new RangeError('Weekly recurrence must include at least one weekday.');
      }
      for (const weekday of pattern.weekdays) {
        assertIntegerInRange(weekday, 0, 6, 'Recurrence weekday');
      }
      assertIntegerInRange(pattern.weekStartsOn, 0, 6, 'Recurrence week start');
      break;
    case 'monthly-date':
      assertPositiveInteger(pattern.interval, 'Recurrence interval');
      assertIntegerInRange(pattern.dayOfMonth, 1, 31, 'Recurrence day of month');
      break;
    case 'monthly-ordinal':
      assertPositiveInteger(pattern.interval, 'Recurrence interval');
      if (!ORDINALS.has(pattern.ordinal)) {
        throw new RangeError('Recurrence ordinal must be first, second, third, fourth, or last.');
      }
      assertIntegerInRange(pattern.weekday, 0, 6, 'Recurrence weekday');
      break;
    case 'yearly-date':
      assertPositiveInteger(pattern.interval, 'Recurrence interval');
      assertIntegerInRange(pattern.month, 1, 12, 'Recurrence month');
      assertIntegerInRange(pattern.day, 1, 31, 'Recurrence day');
      break;
    case 'yearly-ordinal':
      assertPositiveInteger(pattern.interval, 'Recurrence interval');
      assertIntegerInRange(pattern.month, 1, 12, 'Recurrence month');
      if (!ORDINALS.has(pattern.ordinal)) {
        throw new RangeError('Recurrence ordinal must be first, second, third, fourth, or last.');
      }
      assertIntegerInRange(pattern.weekday, 0, 6, 'Recurrence weekday');
      break;
  }
}

export function expandRecurrenceDates(input: RecurrenceExpansionInput): readonly string[] {
  validatePattern(input.recurrence.pattern);

  const anchor = parseLocalDate(input.anchorLocalDate, 'Recurrence anchor');
  const windowStart = parseLocalDate(input.windowStartLocalDate, 'Window start');
  const windowEnd = parseLocalDate(input.windowEndLocalDate, 'Window end');

  if (windowEnd.getTime() < windowStart.getTime()) {
    throw new RangeError('Window end must not be before window start.');
  }

  let inclusiveEnd: Date | null = null;
  let countLimit: number | null = null;
  switch (input.recurrence.end.type) {
    case 'never':
      break;
    case 'date':
      inclusiveEnd = parseLocalDate(
        input.recurrence.end.inclusiveLocalDate,
        'Recurrence inclusive end date',
      );
      break;
    case 'count':
      assertPositiveInteger(input.recurrence.end.occurrenceCount, 'Recurrence occurrence count');
      countLimit = input.recurrence.end.occurrenceCount;
      break;
  }

  const anchorTime = anchor.getTime();
  const windowStartTime = windowStart.getTime();
  const windowEndTime = windowEnd.getTime();
  const inclusiveEndTime = inclusiveEnd?.getTime() ?? null;
  const upperBoundTime =
    inclusiveEndTime === null ? windowEndTime : Math.min(windowEndTime, inclusiveEndTime);

  if (upperBoundTime < anchorTime) {
    return Object.freeze([]);
  }

  const results: string[] = [];
  let createdCount = 0;

  const recordCandidate = (candidate: Date): boolean => {
    const time = candidate.getTime();
    if (!Number.isFinite(time)) {
      return false;
    }
    if (time < anchorTime) {
      return true;
    }
    if (inclusiveEndTime !== null && time > inclusiveEndTime) {
      return false;
    }

    createdCount += 1;
    if (time >= windowStartTime && time <= windowEndTime) {
      results.push(formatLocalDate(candidate));
    }

    return countLimit === null || createdCount < countLimit;
  };

  const pattern = input.recurrence.pattern;
  switch (pattern.type) {
    case 'daily': {
      for (let offset = 0; ; offset += pattern.interval) {
        const candidate = addDays(anchor, offset);
        if (candidate.getTime() > upperBoundTime) {
          break;
        }
        if (!recordCandidate(candidate)) {
          break;
        }
      }
      break;
    }

    case 'weekly': {
      // Phase interval weeks from the persisted calendar-week boundary, not from the anchor date.
      const anchorWeekOffset = (anchor.getUTCDay() - pattern.weekStartsOn + 7) % 7;
      const anchorWeekStart = addDays(anchor, -anchorWeekOffset);
      const weekdayOffsets = [...new Set(pattern.weekdays)]
        .map((weekday) => (weekday - pattern.weekStartsOn + 7) % 7)
        .sort((left, right) => left - right);

      for (let block = 0; ; block += 1) {
        const blockStart = addDays(anchorWeekStart, block * pattern.interval * 7);
        if (blockStart.getTime() > upperBoundTime) {
          break;
        }

        let shouldContinue = true;
        for (const weekdayOffset of weekdayOffsets) {
          const candidate = addDays(blockStart, weekdayOffset);
          if (candidate.getTime() > upperBoundTime) {
            break;
          }
          if (!recordCandidate(candidate)) {
            shouldContinue = false;
            break;
          }
        }
        if (!shouldContinue) {
          break;
        }
      }
      break;
    }

    case 'monthly-date':
    case 'monthly-ordinal': {
      const anchorYear = anchor.getUTCFullYear();
      const anchorMonth = anchor.getUTCMonth() + 1;

      for (let step = 0; ; step += 1) {
        const period = addMonths(anchorYear, anchorMonth, step * pattern.interval);
        const periodStart = makeDate(period.year, period.month, 1);
        if (periodStart === null || periodStart.getTime() > upperBoundTime) {
          break;
        }

        const candidate =
          pattern.type === 'monthly-date'
            ? makeDate(period.year, period.month, pattern.dayOfMonth)
            : ordinalWeekdayDate(period.year, period.month, pattern.ordinal, pattern.weekday);

        if (
          candidate !== null &&
          candidate.getTime() <= upperBoundTime &&
          !recordCandidate(candidate)
        ) {
          break;
        }
      }
      break;
    }

    case 'yearly-date':
    case 'yearly-ordinal': {
      const anchorYear = anchor.getUTCFullYear();

      for (let step = 0; ; step += 1) {
        const year = anchorYear + step * pattern.interval;
        const periodStart = makeDate(year, 1, 1);
        if (periodStart === null || periodStart.getTime() > upperBoundTime) {
          break;
        }

        const candidate =
          pattern.type === 'yearly-date'
            ? makeDate(year, pattern.month, pattern.day)
            : ordinalWeekdayDate(year, pattern.month, pattern.ordinal, pattern.weekday);

        if (
          candidate !== null &&
          candidate.getTime() <= upperBoundTime &&
          !recordCandidate(candidate)
        ) {
          break;
        }
      }
      break;
    }
  }

  return Object.freeze(results);
}
