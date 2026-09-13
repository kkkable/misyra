import type {
  CalendarCommand,
  NormalizedCalendarRecurrence,
  NormalizedProviderSchedule,
  SynchronizedImportBatch,
  SynchronizedProviderEvent,
} from '@misyra/contracts';
import {
  expandRecurrenceDates,
  resolveLocalDateTimeInstant,
  type MissionRecurrence,
} from '@misyra/domain';

const DAY_MS = 24 * 60 * 60 * 1000;

type LocalDateTimeParts = Readonly<{
  localDate: string;
  localTime: string;
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

function localDateAtInstant(instant: Date, timeZone: string): string {
  return localDateTimeParts(instant.toISOString(), timeZone).localDate;
}

function localDateEpochDay(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) throw new TypeError('Calendar local date must use YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError('Calendar local date must be valid');
  }
  return Math.floor(date.getTime() / DAY_MS);
}

function localDateFromEpochDay(epochDay: number): string {
  const date = new Date(epochDay * DAY_MS);
  if (Number.isNaN(date.getTime())) throw new RangeError('Calendar recurrence window is too large');
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addLocalDays(value: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new RangeError('Calendar recurrence window is too large');
  return localDateFromEpochDay(localDateEpochDay(value) + days);
}

function localDayDifference(start: string, finish: string): number {
  return localDateEpochDay(finish) - localDateEpochDay(start);
}

function recurrenceSearchDays(recurrence: NormalizedCalendarRecurrence): number {
  const { pattern } = recurrence;
  switch (pattern.type) {
    case 'daily':
      return pattern.interval + 2;
    case 'weekly':
      return pattern.interval * 7 + 14;
    case 'monthly-date':
    case 'monthly-ordinal':
      return pattern.interval * 62 + 62;
    case 'yearly-date':
    case 'yearly-ordinal':
      // Four cycles cover Gregorian leap-day gaps, including non-leap century years.
      return pattern.interval * 366 * 4 + 1464;
  }
}

function scheduleAnchorLocalDate(schedule: NormalizedProviderSchedule): string {
  return schedule.type === 'all_day'
    ? schedule.startLocalDate
    : localDateTimeParts(schedule.startInstant, schedule.timeZone).localDate;
}

function scheduleAtLocalDate(
  schedule: NormalizedProviderSchedule,
  localDate: string,
): NormalizedProviderSchedule {
  if (schedule.type === 'all_day') {
    const durationDays = localDayDifference(schedule.startLocalDate, schedule.endLocalDateExclusive);
    if (durationDays <= 0) throw new TypeError('All-day calendar schedule is invalid');
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
    resolveLocalDateTimeInstant(
      `${schedule.endLocalDateExclusive}T00:00:00`,
      schedule.timeZone,
    ),
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
  let searchEndLocalDate = addLocalDays(
    nowLocalDate,
    recurrenceSearchDays(event.recurrence),
  );
  if (
    event.recurrence.end.type === 'date' &&
    localDateEpochDay(event.recurrence.end.inclusiveLocalDate) <
      localDateEpochDay(searchEndLocalDate)
  ) {
    searchEndLocalDate = event.recurrence.end.inclusiveLocalDate;
  }
  if (localDateEpochDay(searchEndLocalDate) < localDateEpochDay(anchorLocalDate)) return null;

  const candidateDates = expandRecurrenceDates({
    anchorLocalDate,
    recurrence: event.recurrence as MissionRecurrence,
    windowStartLocalDate: anchorLocalDate,
    windowEndLocalDate: searchEndLocalDate,
  });

  for (let index = 0; index < candidateDates.length; index += 1) {
    const candidateDate = candidateDates[index];
    if (candidateDate === undefined) continue;
    const schedule = scheduleAtLocalDate(event.schedule, candidateDate);
    if (scheduleFinishEpochMs(schedule) <= now.getTime()) continue;
    return {
      ...event,
      schedule,
      recurrence: adjustedRecurrence(event.recurrence, index),
    };
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
