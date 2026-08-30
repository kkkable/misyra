import { Temporal } from '@js-temporal/polyfill';

import type { MissionSchedule, TimeBehavior } from './mission-model.js';

export interface ZonedTimedScheduleInput {
  readonly localStart: string;
  readonly localFinish: string;
  readonly timeZone: string;
  readonly timeBehavior: TimeBehavior;
}

export interface ZonedAllDayScheduleInput {
  readonly localDate: string;
  readonly timeZone: string;
  readonly estimatedEffortMinutes: number;
}

export interface TravelProjectionInput {
  readonly schedule: MissionSchedule;
  readonly destinationTimeZone: string;
}

export interface AbsoluteLatenessInput {
  readonly actionInstant: string;
  readonly scheduledFinishInstant: string;
  readonly graceMinutes: number;
}

export type ClockValidationResult = 'valid' | 'invalid';

export interface EffectiveTimestampInput {
  readonly clientTime: string;
  readonly serverReceiptTime: string;
  readonly validationResult: ClockValidationResult;
}

export interface EffectiveTimestampResult {
  readonly originalClientTime: string;
  readonly serverReceiptTime: string;
  readonly effectiveTime: string;
  readonly validationResult: ClockValidationResult;
}

function assertTimeZone(timeZone: string): void {
  try {
    Temporal.Now.instant().toZonedDateTimeISO(timeZone);
  } catch {
    throw new TypeError(`Invalid IANA time zone: ${timeZone}.`);
  }
}

function parsePlainDateTime(value: string, label: string): Temporal.PlainDateTime {
  try {
    return Temporal.PlainDateTime.from(value);
  } catch {
    throw new TypeError(`${label} must be a valid local date-time.`);
  }
}

function parseInstant(value: string, label: string): Temporal.Instant {
  try {
    return Temporal.Instant.from(value);
  } catch {
    throw new TypeError(`${label} must be a valid absolute timestamp.`);
  }
}

function toIsoInstant(instant: Temporal.Instant): string {
  return new Date(instant.epochMilliseconds).toISOString();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatPlainDateTime(value: Temporal.PlainDateTime): string {
  return `${String(value.year).padStart(4, '0')}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}`;
}

function resolveWallTime(localDateTime: string, timeZone: string, label: string): Temporal.Instant {
  assertTimeZone(timeZone);
  const plain = parsePlainDateTime(localDateTime, label);
  try {
    return plain.toZonedDateTime(timeZone).toInstant();
  } catch {
    throw new TypeError(`${label} could not be resolved in time zone ${timeZone}.`);
  }
}

function freezeSchedule(schedule: MissionSchedule): MissionSchedule {
  return Object.freeze(schedule);
}

export function createZonedTimedSchedule(input: ZonedTimedScheduleInput): MissionSchedule {
  const start = resolveWallTime(input.localStart, input.timeZone, 'Local start');
  const finish = resolveWallTime(input.localFinish, input.timeZone, 'Local finish');
  if (Temporal.Instant.compare(finish, start) <= 0) {
    throw new RangeError('Local finish must resolve after local start.');
  }

  return freezeSchedule({
    localStart: input.localStart,
    localFinish: input.localFinish,
    startInstant: toIsoInstant(start),
    finishInstant: toIsoInstant(finish),
    timeZone: input.timeZone,
    timeBehavior: input.timeBehavior,
    allDay: false,
    estimatedEffortMinutes: null,
  });
}

export function createZonedAllDaySchedule(input: ZonedAllDayScheduleInput): MissionSchedule {
  if (!Number.isInteger(input.estimatedEffortMinutes) || input.estimatedEffortMinutes <= 0) {
    throw new RangeError('Estimated effort minutes must be a positive integer.');
  }
  assertTimeZone(input.timeZone);

  let date: Temporal.PlainDate;
  try {
    date = Temporal.PlainDate.from(input.localDate);
  } catch {
    throw new TypeError('Local date must be a valid ISO local date.');
  }

  const nextDate = date.add({ days: 1 });
  const localStart = `${date.toString()}T00:00:00`;
  const localFinish = `${nextDate.toString()}T00:00:00`;
  const start = resolveWallTime(localStart, input.timeZone, 'All-day local start');
  const finish = resolveWallTime(localFinish, input.timeZone, 'All-day local finish');

  return freezeSchedule({
    localStart,
    localFinish,
    startInstant: toIsoInstant(start),
    finishInstant: toIsoInstant(finish),
    timeZone: input.timeZone,
    timeBehavior: 'local_time',
    allDay: true,
    estimatedEffortMinutes: input.estimatedEffortMinutes,
  });
}

export function projectScheduleToTimeZone(input: TravelProjectionInput): MissionSchedule {
  assertTimeZone(input.destinationTimeZone);

  if (input.schedule.timeBehavior === 'local_time') {
    const start = resolveWallTime(
      input.schedule.localStart,
      input.destinationTimeZone,
      'Projected local start',
    );
    const finish = resolveWallTime(
      input.schedule.localFinish,
      input.destinationTimeZone,
      'Projected local finish',
    );
    if (Temporal.Instant.compare(finish, start) <= 0) {
      throw new RangeError('Projected finish must resolve after projected start.');
    }

    return freezeSchedule({
      ...input.schedule,
      startInstant: toIsoInstant(start),
      finishInstant: toIsoInstant(finish),
      timeZone: input.destinationTimeZone,
    });
  }

  const start = parseInstant(input.schedule.startInstant, 'Start instant');
  const finish = parseInstant(input.schedule.finishInstant, 'Finish instant');
  const localStart = formatPlainDateTime(
    start.toZonedDateTimeISO(input.destinationTimeZone).toPlainDateTime(),
  );
  const localFinish = formatPlainDateTime(
    finish.toZonedDateTimeISO(input.destinationTimeZone).toPlainDateTime(),
  );

  return freezeSchedule({
    ...input.schedule,
    localStart,
    localFinish,
    timeZone: input.destinationTimeZone,
  });
}

export function isLateByAbsoluteTime(input: AbsoluteLatenessInput): boolean {
  if (!Number.isInteger(input.graceMinutes) || input.graceMinutes < 0) {
    throw new RangeError('Grace minutes must be a non-negative integer.');
  }
  const action = parseInstant(input.actionInstant, 'Action instant');
  const finish = parseInstant(input.scheduledFinishInstant, 'Scheduled finish instant');
  const threshold = finish.add({ minutes: input.graceMinutes });
  return Temporal.Instant.compare(action, threshold) > 0;
}

export function resolveEffectiveTimestamp(
  input: EffectiveTimestampInput,
): EffectiveTimestampResult {
  parseInstant(input.serverReceiptTime, 'Server receipt time');
  if (input.validationResult === 'valid') {
    parseInstant(input.clientTime, 'Client time');
  }

  return Object.freeze({
    originalClientTime: input.clientTime,
    serverReceiptTime: input.serverReceiptTime,
    effectiveTime: input.validationResult === 'valid' ? input.clientTime : input.serverReceiptTime,
    validationResult: input.validationResult,
  });
}
