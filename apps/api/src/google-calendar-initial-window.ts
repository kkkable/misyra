import type {
  CalendarCommand,
  NormalizedCalendarRecurrence,
  NormalizedProviderSchedule,
  SynchronizedImportBatch,
  SynchronizedProviderEvent,
} from '@misyra/contracts';
import { resolveLocalDateTimeInstant } from '@misyra/domain';

const DAY_MS = 24 * 60 * 60 * 1000;
const GREGORIAN_MONTH_CYCLE = 4_800;
const GREGORIAN_YEAR_CYCLE = 400;

type LocalDateTimeParts = Readonly<{
  localDate: string;
  localTime: string;
}>;

type LocalDateParts = Readonly<{
  year: number;
  month: number;
  day: number;
}>;

type RecurrenceCandidate = Readonly<{
  localDate: string;
  index: number;
}>;

function requiredPart(parts: readonly Intl.DateTimeFormatPart[], type: string): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) throw new TypeError(`Calendar time-zone projection omitted ${type}`);
  return value;
}

function localDateTimeParts(instant: string, timeZone: string): LocalDateTimeParts {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) throw new TypeError('Calendar schedule instant is invalid');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const year = requiredPart(parts, 'year');
  const month = requiredPart(parts, 'month');
  const day = requiredPart(parts, 'day');
  const hour = requiredPart(parts, 'hour');
  const minute = requiredPart(parts, 'minute');
  const second = requiredPart(parts, 'second');
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
  return {
    localDate: `${year}-${month}-${day}`,
    localTime: `${hour}:${minute}:${second}.${milliseconds}`,
  };
}

function localDateParts(value: string): LocalDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) throw new TypeError('Calendar local date must use YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new TypeError('Calendar local date must be valid');
  }
  return { year, month, day };
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return 0;
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function formatLocalDate(year: number, month: number, day: number): string | null {
  if (year < 0 || year > 9999 || day < 1 || day > daysInMonth(year, month)) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function localDateEpochDay(value: string): number {
  const { year, month, day } = localDateParts(value);
  const timestamp = Date.parse(
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`,
  );
  if (!Number.isFinite(timestamp)) throw new TypeError('Calendar local date must be valid');
  return Math.floor(timestamp / DAY_MS);
}

function localDateFromEpochDay(epochDay: number): string {
  if (!Number.isSafeInteger(epochDay)) throw new RangeError('Calendar date range is too large');
  const date = new Date(epochDay * DAY_MS);
  if (Number.isNaN(date.getTime())) throw new RangeError('Calendar date range is too large');
  const localDate = formatLocalDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
  if (localDate === null) throw new RangeError('Calendar date range is too large');
  return localDate;
}

function addLocalDays(value: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new RangeError('Calendar date range is too large');
  return localDateFromEpochDay(localDateEpochDay(value) + days);
}

function localDayDifference(start: string, finish: string): number {
  return localDateEpochDay(finish) - localDateEpochDay(start);
}

function localDateAtInstant(instant: Date, timeZone: string): string {
  return localDateTimeParts(instant.toISOString(), timeZone).localDate;
}

function weekdayForLocalDate(value: string): number {
  return new Date(localDateEpochDay(value) * DAY_MS).getUTCDay();
}

function absoluteMonth(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function yearMonthFromAbsoluteMonth(value: number): Readonly<{ year: number; month: number }> {
  const year = Math.floor(value / 12);
  return { year, month: value - year * 12 + 1 };
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function safePositiveInterval(interval: number): number {
  if (!Number.isSafeInteger(interval) || interval <= 0) {
    throw new RangeError('Calendar recurrence interval must be a safe positive integer');
  }
  return interval;
}

function safeOccurrenceIndex(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Calendar recurrence occurrence index is too large');
  }
  return value;
}

function ordinalWeekdayDate(
  year: number,
  month: number,
  ordinal: 1 | 2 | 3 | 4 | -1,
  weekday: number,
): string | null {
  if (ordinal === -1) {
    const lastDay = daysInMonth(year, month);
    const lastDate = formatLocalDate(year, month, lastDay);
    if (lastDate === null) return null;
    const offset = (weekdayForLocalDate(lastDate) - weekday + 7) % 7;
    return formatLocalDate(year, month, lastDay - offset);
  }

  const firstDate = formatLocalDate(year, month, 1);
  if (firstDate === null) return null;
  const offset = (weekday - weekdayForLocalDate(firstDate) + 7) % 7;
  return formatLocalDate(year, month, 1 + offset + (ordinal - 1) * 7);
}

function applyRecurrenceEnd(
  candidate: RecurrenceCandidate | null,
  recurrence: NormalizedCalendarRecurrence,
): RecurrenceCandidate | null {
  if (candidate === null) return null;
  if (recurrence.end.type === 'count' && candidate.index >= recurrence.end.occurrenceCount) {
    return null;
  }
  if (
    recurrence.end.type === 'date' &&
    localDateEpochDay(candidate.localDate) > localDateEpochDay(recurrence.end.inclusiveLocalDate)
  ) {
    return null;
  }
  return candidate;
}

function dailyCandidate(
  anchorLocalDate: string,
  targetLocalDate: string,
  interval: number,
): RecurrenceCandidate {
  const anchorDay = localDateEpochDay(anchorLocalDate);
  const targetDay = Math.max(anchorDay, localDateEpochDay(targetLocalDate));
  const delta = targetDay - anchorDay;
  const index = safeOccurrenceIndex(delta === 0 ? 0 : Math.ceil(delta / interval));
  const offset = index * interval;
  if (!Number.isSafeInteger(offset)) throw new RangeError('Calendar recurrence range is too large');
  return { localDate: localDateFromEpochDay(anchorDay + offset), index };
}

function weeklyCandidate(
  anchorLocalDate: string,
  targetLocalDate: string,
  recurrence: Extract<NormalizedCalendarRecurrence['pattern'], { type: 'weekly' }>,
): RecurrenceCandidate | null {
  const interval = safePositiveInterval(recurrence.interval);
  const anchorDay = localDateEpochDay(anchorLocalDate);
  const targetDay = Math.max(anchorDay, localDateEpochDay(targetLocalDate));
  const anchorWeekOffset = (weekdayForLocalDate(anchorLocalDate) - recurrence.weekStartsOn + 7) % 7;
  const anchorWeekStart = anchorDay - anchorWeekOffset;
  const offsets = [...new Set(recurrence.weekdays)]
    .map((weekday) => (weekday - recurrence.weekStartsOn + 7) % 7)
    .sort((left, right) => left - right);
  const firstBlockOffsets = offsets.filter((offset) => anchorWeekStart + offset >= anchorDay);
  const blockSpan = interval * 7;
  if (!Number.isSafeInteger(blockSpan))
    throw new RangeError('Calendar recurrence range is too large');

  let block = Math.max(0, Math.floor((targetDay - anchorWeekStart) / blockSpan));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const blockStart = anchorWeekStart + block * blockSpan;
    if (!Number.isSafeInteger(blockStart))
      throw new RangeError('Calendar recurrence range is too large');
    const available = block === 0 ? firstBlockOffsets : offsets;
    const position = available.findIndex((offset) => blockStart + offset >= targetDay);
    if (position >= 0) {
      const index =
        block === 0 ? position : firstBlockOffsets.length + (block - 1) * offsets.length + position;
      return {
        localDate: localDateFromEpochDay(blockStart + (available[position] ?? 0)),
        index: safeOccurrenceIndex(index),
      };
    }
    block += 1;
  }
  return null;
}

function monthlyOrdinalCandidate(
  anchorLocalDate: string,
  targetLocalDate: string,
  recurrence: Extract<NormalizedCalendarRecurrence['pattern'], { type: 'monthly-ordinal' }>,
): RecurrenceCandidate | null {
  const interval = safePositiveInterval(recurrence.interval);
  const anchor = localDateParts(anchorLocalDate);
  const target = localDateParts(targetLocalDate);
  const anchorMonth = absoluteMonth(anchor.year, anchor.month);
  const targetMonth = absoluteMonth(target.year, target.month);
  const first = ordinalWeekdayDate(
    anchor.year,
    anchor.month,
    recurrence.ordinal,
    recurrence.weekday,
  );
  const firstStep =
    first !== null && localDateEpochDay(first) >= localDateEpochDay(anchorLocalDate) ? 0 : 1;
  let step = Math.max(firstStep, Math.floor(Math.max(0, targetMonth - anchorMonth) / interval));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const monthValue = anchorMonth + step * interval;
    if (!Number.isSafeInteger(monthValue))
      throw new RangeError('Calendar recurrence range is too large');
    const period = yearMonthFromAbsoluteMonth(monthValue);
    const candidate = ordinalWeekdayDate(
      period.year,
      period.month,
      recurrence.ordinal,
      recurrence.weekday,
    );
    if (
      candidate !== null &&
      localDateEpochDay(candidate) >= localDateEpochDay(anchorLocalDate) &&
      localDateEpochDay(candidate) >= localDateEpochDay(targetLocalDate)
    ) {
      return { localDate: candidate, index: safeOccurrenceIndex(step - firstStep) };
    }
    step += 1;
  }
  return null;
}

function yearlyOrdinalCandidate(
  anchorLocalDate: string,
  targetLocalDate: string,
  recurrence: Extract<NormalizedCalendarRecurrence['pattern'], { type: 'yearly-ordinal' }>,
): RecurrenceCandidate | null {
  const interval = safePositiveInterval(recurrence.interval);
  const anchor = localDateParts(anchorLocalDate);
  const target = localDateParts(targetLocalDate);
  const first = ordinalWeekdayDate(
    anchor.year,
    recurrence.month,
    recurrence.ordinal,
    recurrence.weekday,
  );
  const firstStep =
    first !== null && localDateEpochDay(first) >= localDateEpochDay(anchorLocalDate) ? 0 : 1;
  let step = Math.max(firstStep, Math.floor(Math.max(0, target.year - anchor.year) / interval));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const year = anchor.year + step * interval;
    if (!Number.isSafeInteger(year) || year > 9999) return null;
    const candidate = ordinalWeekdayDate(
      year,
      recurrence.month,
      recurrence.ordinal,
      recurrence.weekday,
    );
    if (
      candidate !== null &&
      localDateEpochDay(candidate) >= localDateEpochDay(anchorLocalDate) &&
      localDateEpochDay(candidate) >= localDateEpochDay(targetLocalDate)
    ) {
      return { localDate: candidate, index: safeOccurrenceIndex(step - firstStep) };
    }
    step += 1;
  }
  return null;
}

function monthlyDateIsValid(
  anchorMonth: number,
  interval: number,
  dayOfMonth: number,
  step: number,
): boolean {
  const monthValue = anchorMonth + step * interval;
  const period = yearMonthFromAbsoluteMonth(monthValue);
  return dayOfMonth <= daysInMonth(period.year, period.month);
}

function countMonthlyDateOccurrencesBefore(
  anchorLocalDate: string,
  interval: number,
  dayOfMonth: number,
  step: number,
): number {
  if (step <= 0) return 0;
  const anchor = localDateParts(anchorLocalDate);
  const anchorMonth = absoluteMonth(anchor.year, anchor.month);
  const cycleLength =
    GREGORIAN_MONTH_CYCLE / greatestCommonDivisor(interval, GREGORIAN_MONTH_CYCLE);
  let validPerCycle = 0;
  for (let offset = 0; offset < cycleLength; offset += 1) {
    if (monthlyDateIsValid(anchorMonth, interval, dayOfMonth, offset)) validPerCycle += 1;
  }
  const fullCycles = Math.floor(step / cycleLength);
  const remainder = step % cycleLength;
  let count = fullCycles * validPerCycle;
  for (let offset = 0; offset < remainder; offset += 1) {
    if (monthlyDateIsValid(anchorMonth, interval, dayOfMonth, offset)) count += 1;
  }
  const stepZero = formatLocalDate(anchor.year, anchor.month, dayOfMonth);
  if (stepZero !== null && localDateEpochDay(stepZero) < localDateEpochDay(anchorLocalDate)) {
    count -= 1;
  }
  return safeOccurrenceIndex(count);
}

function monthlyDateCandidate(
  anchorLocalDate: string,
  targetLocalDate: string,
  recurrence: Extract<NormalizedCalendarRecurrence['pattern'], { type: 'monthly-date' }>,
): RecurrenceCandidate | null {
  const interval = safePositiveInterval(recurrence.interval);
  const anchor = localDateParts(anchorLocalDate);
  const target = localDateParts(targetLocalDate);
  const anchorMonth = absoluteMonth(anchor.year, anchor.month);
  const targetMonth = absoluteMonth(target.year, target.month);
  const cycleLength =
    GREGORIAN_MONTH_CYCLE / greatestCommonDivisor(interval, GREGORIAN_MONTH_CYCLE);
  let step = Math.max(0, Math.floor(Math.max(0, targetMonth - anchorMonth) / interval));

  for (let attempt = 0; attempt <= cycleLength; attempt += 1) {
    const monthValue = anchorMonth + step * interval;
    if (!Number.isSafeInteger(monthValue))
      throw new RangeError('Calendar recurrence range is too large');
    const period = yearMonthFromAbsoluteMonth(monthValue);
    if (period.year > 9999) return null;
    const candidate = formatLocalDate(period.year, period.month, recurrence.dayOfMonth);
    if (
      candidate !== null &&
      localDateEpochDay(candidate) >= localDateEpochDay(anchorLocalDate) &&
      localDateEpochDay(candidate) >= localDateEpochDay(targetLocalDate)
    ) {
      return {
        localDate: candidate,
        index: countMonthlyDateOccurrencesBefore(
          anchorLocalDate,
          interval,
          recurrence.dayOfMonth,
          step,
        ),
      };
    }
    step += 1;
  }
  return null;
}

function yearlyDateIsValid(
  anchorYear: number,
  interval: number,
  month: number,
  day: number,
  step: number,
): boolean {
  return day <= daysInMonth(anchorYear + step * interval, month);
}

function countYearlyDateOccurrencesBefore(
  anchorLocalDate: string,
  interval: number,
  month: number,
  day: number,
  step: number,
): number {
  if (step <= 0) return 0;
  const anchor = localDateParts(anchorLocalDate);
  const cycleLength = GREGORIAN_YEAR_CYCLE / greatestCommonDivisor(interval, GREGORIAN_YEAR_CYCLE);
  let validPerCycle = 0;
  for (let offset = 0; offset < cycleLength; offset += 1) {
    if (yearlyDateIsValid(anchor.year, interval, month, day, offset)) validPerCycle += 1;
  }
  const fullCycles = Math.floor(step / cycleLength);
  const remainder = step % cycleLength;
  let count = fullCycles * validPerCycle;
  for (let offset = 0; offset < remainder; offset += 1) {
    if (yearlyDateIsValid(anchor.year, interval, month, day, offset)) count += 1;
  }
  const stepZero = formatLocalDate(anchor.year, month, day);
  if (stepZero !== null && localDateEpochDay(stepZero) < localDateEpochDay(anchorLocalDate)) {
    count -= 1;
  }
  return safeOccurrenceIndex(count);
}

function yearlyDateCandidate(
  anchorLocalDate: string,
  targetLocalDate: string,
  recurrence: Extract<NormalizedCalendarRecurrence['pattern'], { type: 'yearly-date' }>,
): RecurrenceCandidate | null {
  const interval = safePositiveInterval(recurrence.interval);
  const anchor = localDateParts(anchorLocalDate);
  const target = localDateParts(targetLocalDate);
  const cycleLength = GREGORIAN_YEAR_CYCLE / greatestCommonDivisor(interval, GREGORIAN_YEAR_CYCLE);
  let step = Math.max(0, Math.floor(Math.max(0, target.year - anchor.year) / interval));

  for (let attempt = 0; attempt <= cycleLength; attempt += 1) {
    const year = anchor.year + step * interval;
    if (!Number.isSafeInteger(year) || year > 9999) return null;
    const candidate = formatLocalDate(year, recurrence.month, recurrence.day);
    if (
      candidate !== null &&
      localDateEpochDay(candidate) >= localDateEpochDay(anchorLocalDate) &&
      localDateEpochDay(candidate) >= localDateEpochDay(targetLocalDate)
    ) {
      return {
        localDate: candidate,
        index: countYearlyDateOccurrencesBefore(
          anchorLocalDate,
          interval,
          recurrence.month,
          recurrence.day,
          step,
        ),
      };
    }
    step += 1;
  }
  return null;
}

function firstOccurrenceOnOrAfter(
  anchorLocalDate: string,
  recurrence: NormalizedCalendarRecurrence,
  targetLocalDate: string,
): RecurrenceCandidate | null {
  const interval = safePositiveInterval(recurrence.pattern.interval);
  let candidate: RecurrenceCandidate | null;
  switch (recurrence.pattern.type) {
    case 'daily':
      candidate = dailyCandidate(anchorLocalDate, targetLocalDate, interval);
      break;
    case 'weekly':
      candidate = weeklyCandidate(anchorLocalDate, targetLocalDate, recurrence.pattern);
      break;
    case 'monthly-date':
      candidate = monthlyDateCandidate(anchorLocalDate, targetLocalDate, recurrence.pattern);
      break;
    case 'monthly-ordinal':
      candidate = monthlyOrdinalCandidate(anchorLocalDate, targetLocalDate, recurrence.pattern);
      break;
    case 'yearly-date':
      candidate = yearlyDateCandidate(anchorLocalDate, targetLocalDate, recurrence.pattern);
      break;
    case 'yearly-ordinal':
      candidate = yearlyOrdinalCandidate(anchorLocalDate, targetLocalDate, recurrence.pattern);
      break;
  }
  return applyRecurrenceEnd(candidate, recurrence);
}

function scheduleAnchorLocalDate(schedule: NormalizedProviderSchedule): string {
  return schedule.type === 'all_day'
    ? schedule.startLocalDate
    : localDateTimeParts(schedule.startInstant, schedule.timeZone).localDate;
}

function scheduleSpanDays(schedule: NormalizedProviderSchedule): number {
  if (schedule.type === 'all_day') {
    const durationDays = localDayDifference(
      schedule.startLocalDate,
      schedule.endLocalDateExclusive,
    );
    if (durationDays <= 0) throw new TypeError('All-day calendar schedule is invalid');
    return durationDays;
  }
  const start = localDateTimeParts(schedule.startInstant, schedule.timeZone);
  const finish = localDateTimeParts(schedule.finishInstant, schedule.timeZone);
  const durationDays = localDayDifference(start.localDate, finish.localDate);
  if (durationDays < 0) throw new TypeError('Timed calendar schedule is invalid');
  return durationDays;
}

function scheduleAtLocalDate(
  schedule: NormalizedProviderSchedule,
  localDate: string,
): NormalizedProviderSchedule {
  if (schedule.type === 'all_day') {
    const durationDays = scheduleSpanDays(schedule);
    return {
      ...schedule,
      startLocalDate: localDate,
      endLocalDateExclusive: addLocalDays(localDate, durationDays),
    };
  }

  const start = localDateTimeParts(schedule.startInstant, schedule.timeZone);
  const finish = localDateTimeParts(schedule.finishInstant, schedule.timeZone);
  const finishDayOffset = localDayDifference(start.localDate, finish.localDate);
  const startInstant = resolveLocalDateTimeInstant(
    `${localDate}T${start.localTime}`,
    schedule.timeZone,
  );
  const finishInstant = resolveLocalDateTimeInstant(
    `${addLocalDays(localDate, finishDayOffset)}T${finish.localTime}`,
    schedule.timeZone,
  );
  if (new Date(finishInstant).getTime() <= new Date(startInstant).getTime()) {
    throw new TypeError('Recurring calendar schedule must finish after it starts');
  }
  return { ...schedule, startInstant, finishInstant };
}

function scheduleFinishEpochMs(schedule: NormalizedProviderSchedule): number {
  if (schedule.type === 'timed') {
    const finish = new Date(schedule.finishInstant).getTime();
    if (!Number.isFinite(finish)) throw new TypeError('Calendar finish instant is invalid');
    return finish;
  }
  return new Date(
    resolveLocalDateTimeInstant(`${schedule.endLocalDateExclusive}T00:00:00`, schedule.timeZone),
  ).getTime();
}

function adjustedRecurrence(
  recurrence: NormalizedCalendarRecurrence,
  skippedOccurrences: number,
): NormalizedCalendarRecurrence {
  if (recurrence.end.type !== 'count') return recurrence;
  const occurrenceCount = recurrence.end.occurrenceCount - skippedOccurrences;
  if (occurrenceCount <= 0) throw new RangeError('Recurring calendar series is exhausted');
  return {
    ...recurrence,
    end: { type: 'count', occurrenceCount },
  };
}

function futureOnlyEvent(
  event: SynchronizedProviderEvent,
  now: Date,
): SynchronizedProviderEvent | null {
  if (event.recurrence === null) {
    return scheduleFinishEpochMs(event.schedule) > now.getTime() ? event : null;
  }

  const anchorLocalDate = scheduleAnchorLocalDate(event.schedule);
  const nowLocalDate = localDateAtInstant(now, event.schedule.timeZone);
  const searchStartLocalDate = addLocalDays(nowLocalDate, -scheduleSpanDays(event.schedule));
  let candidate = firstOccurrenceOnOrAfter(anchorLocalDate, event.recurrence, searchStartLocalDate);

  for (let attempt = 0; attempt < 2 && candidate !== null; attempt += 1) {
    const schedule = scheduleAtLocalDate(event.schedule, candidate.localDate);
    if (scheduleFinishEpochMs(schedule) > now.getTime()) {
      return {
        ...event,
        schedule,
        recurrence: adjustedRecurrence(event.recurrence, candidate.index),
      };
    }
    candidate = firstOccurrenceOnOrAfter(
      anchorLocalDate,
      event.recurrence,
      addLocalDays(candidate.localDate, 1),
    );
  }
  return null;
}

export function projectFutureOnlyInitialImport(
  batch: SynchronizedImportBatch,
  now: Date,
): SynchronizedImportBatch {
  const events: SynchronizedProviderEvent[] = [];
  for (const event of batch.events) {
    const projected = futureOnlyEvent(event, now);
    if (projected !== null) events.push(projected);
  }
  return { events, cursor: batch.cursor };
}

export function isFutureInitialCalendarCommand(command: CalendarCommand, now: Date): boolean {
  if (command.operation !== 'create') return false;
  return scheduleFinishEpochMs(command.event.schedule) > now.getTime();
}