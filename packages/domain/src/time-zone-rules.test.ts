import { describe, expect, it } from 'vitest';

import * as domainModule from './index.js';

type TimeBehavior = 'local_time' | 'fixed_instant';

interface MissionScheduleLike {
  readonly localStart: string;
  readonly localFinish: string;
  readonly startInstant: string;
  readonly finishInstant: string;
  readonly timeZone: string;
  readonly timeBehavior: TimeBehavior;
  readonly allDay: boolean;
  readonly estimatedEffortMinutes: number | null;
}

interface TimedScheduleInput {
  readonly localStart: string;
  readonly localFinish: string;
  readonly timeZone: string;
  readonly timeBehavior: TimeBehavior;
}

interface AllDayScheduleInput {
  readonly localDate: string;
  readonly timeZone: string;
  readonly estimatedEffortMinutes: number;
}

interface TravelProjectionInput {
  readonly schedule: MissionScheduleLike;
  readonly destinationTimeZone: string;
}

interface LatenessInput {
  readonly actionInstant: string;
  readonly scheduledFinishInstant: string;
  readonly graceMinutes: number;
}

interface EffectiveTimestampInput {
  readonly clientTime: string;
  readonly serverReceiptTime: string;
  readonly validationResult: 'valid' | 'invalid';
}

interface EffectiveTimestampResult {
  readonly originalClientTime: string;
  readonly serverReceiptTime: string;
  readonly effectiveTime: string;
  readonly validationResult: 'valid' | 'invalid';
}

type CreateTimedSchedule = (input: TimedScheduleInput) => MissionScheduleLike;
type CreateAllDaySchedule = (input: AllDayScheduleInput) => MissionScheduleLike;
type ProjectSchedule = (input: TravelProjectionInput) => MissionScheduleLike;
type IsLate = (input: LatenessInput) => boolean;
type ResolveTimestamp = (input: EffectiveTimestampInput) => EffectiveTimestampResult;

const module = domainModule as unknown as Record<string, unknown>;

function isCreateTimedSchedule(value: unknown): value is CreateTimedSchedule {
  return typeof value === 'function';
}

function isCreateAllDaySchedule(value: unknown): value is CreateAllDaySchedule {
  return typeof value === 'function';
}

function isProjectSchedule(value: unknown): value is ProjectSchedule {
  return typeof value === 'function';
}

function isLateFunction(value: unknown): value is IsLate {
  return typeof value === 'function';
}

function isResolveTimestamp(value: unknown): value is ResolveTimestamp {
  return typeof value === 'function';
}

function createTimedSchedule(input: TimedScheduleInput): MissionScheduleLike {
  const candidate = module['createZonedTimedSchedule'];
  if (!isCreateTimedSchedule(candidate)) {
    throw new TypeError('Missing required domain function: createZonedTimedSchedule');
  }
  return candidate(input);
}

function createAllDaySchedule(input: AllDayScheduleInput): MissionScheduleLike {
  const candidate = module['createZonedAllDaySchedule'];
  if (!isCreateAllDaySchedule(candidate)) {
    throw new TypeError('Missing required domain function: createZonedAllDaySchedule');
  }
  return candidate(input);
}

function projectSchedule(input: TravelProjectionInput): MissionScheduleLike {
  const candidate = module['projectScheduleToTimeZone'];
  if (!isProjectSchedule(candidate)) {
    throw new TypeError('Missing required domain function: projectScheduleToTimeZone');
  }
  return candidate(input);
}

function isLate(input: LatenessInput): boolean {
  const candidate = module['isLateByAbsoluteTime'];
  if (!isLateFunction(candidate)) {
    throw new TypeError('Missing required domain function: isLateByAbsoluteTime');
  }
  return candidate(input);
}

function resolveTimestamp(input: EffectiveTimestampInput): EffectiveTimestampResult {
  const candidate = module['resolveEffectiveTimestamp'];
  if (!isResolveTimestamp(candidate)) {
    throw new TypeError('Missing required domain function: resolveEffectiveTimestamp');
  }
  return candidate(input);
}

describe('MTS-016 time-zone and travel rules', () => {
  it('derives UTC instants from IANA wall times across a DST spring transition', () => {
    const schedule = createTimedSchedule({
      localStart: '2026-03-08T01:30:00',
      localFinish: '2026-03-08T03:30:00',
      timeZone: 'America/New_York',
      timeBehavior: 'local_time',
    });

    expect(schedule).toMatchObject({
      localStart: '2026-03-08T01:30:00',
      localFinish: '2026-03-08T03:30:00',
      startInstant: '2026-03-08T06:30:00.000Z',
      finishInstant: '2026-03-08T07:30:00.000Z',
      timeZone: 'America/New_York',
      timeBehavior: 'local_time',
      allDay: false,
      estimatedEffortMinutes: null,
    });
  });

  it('keeps wall-clock time for local-time missions when travelling', () => {
    const tokyo = createTimedSchedule({
      localStart: '2026-09-01T09:00:00',
      localFinish: '2026-09-01T10:00:00',
      timeZone: 'Asia/Tokyo',
      timeBehavior: 'local_time',
    });

    const london = projectSchedule({ schedule: tokyo, destinationTimeZone: 'Europe/London' });

    expect(london).toMatchObject({
      localStart: '2026-09-01T09:00:00',
      localFinish: '2026-09-01T10:00:00',
      startInstant: '2026-09-01T08:00:00.000Z',
      finishInstant: '2026-09-01T09:00:00.000Z',
      timeZone: 'Europe/London',
      timeBehavior: 'local_time',
    });
  });

  it('keeps absolute instants for fixed-instant events when travelling', () => {
    const tokyo = createTimedSchedule({
      localStart: '2026-09-01T09:00:00',
      localFinish: '2026-09-01T10:00:00',
      timeZone: 'Asia/Tokyo',
      timeBehavior: 'fixed_instant',
    });

    const london = projectSchedule({ schedule: tokyo, destinationTimeZone: 'Europe/London' });

    expect(london).toMatchObject({
      localStart: '2026-09-01T01:00:00',
      localFinish: '2026-09-01T02:00:00',
      startInstant: tokyo.startInstant,
      finishInstant: tokyo.finishInstant,
      timeZone: 'Europe/London',
      timeBehavior: 'fixed_instant',
    });
  });

  it('uses consecutive local midnights for all-day boundaries even on a 23-hour DST day', () => {
    const schedule = createAllDaySchedule({
      localDate: '2026-03-08',
      timeZone: 'America/New_York',
      estimatedEffortMinutes: 45,
    });

    expect(schedule).toMatchObject({
      localStart: '2026-03-08T00:00:00',
      localFinish: '2026-03-09T00:00:00',
      startInstant: '2026-03-08T05:00:00.000Z',
      finishInstant: '2026-03-09T04:00:00.000Z',
      timeZone: 'America/New_York',
      timeBehavior: 'local_time',
      allDay: true,
      estimatedEffortMinutes: 45,
    });
    expect(Date.parse(schedule.finishInstant) - Date.parse(schedule.startInstant)).toBe(
      23 * 60 * 60 * 1000,
    );
  });

  it('compares lateness using absolute timestamps and the exact grace threshold', () => {
    const finish = '2026-09-01T01:00:00.000Z';

    expect(
      isLate({
        actionInstant: '2026-09-01T01:10:00.000Z',
        scheduledFinishInstant: finish,
        graceMinutes: 10,
      }),
    ).toBe(false);
    expect(
      isLate({
        actionInstant: '2026-09-01T01:10:00.001Z',
        scheduledFinishInstant: finish,
        graceMinutes: 10,
      }),
    ).toBe(true);
  });

  it('silently falls back to server receipt time when the device timestamp is invalid', () => {
    const clientTime = '2026-09-01T00:00:00.000Z';
    const serverReceiptTime = '2026-09-01T00:00:05.000Z';

    expect(resolveTimestamp({ clientTime, serverReceiptTime, validationResult: 'valid' })).toEqual({
      originalClientTime: clientTime,
      serverReceiptTime,
      effectiveTime: clientTime,
      validationResult: 'valid',
    });
    expect(
      resolveTimestamp({ clientTime, serverReceiptTime, validationResult: 'invalid' }),
    ).toEqual({
      originalClientTime: clientTime,
      serverReceiptTime,
      effectiveTime: serverReceiptTime,
      validationResult: 'invalid',
    });
  });

  it('rejects non-IANA zone identifiers and malformed timestamps instead of guessing', () => {
    expect(() =>
      createTimedSchedule({
        localStart: '2026-09-01T09:00:00',
        localFinish: '2026-09-01T10:00:00',
        timeZone: 'Hong Kong',
        timeBehavior: 'local_time',
      }),
    ).toThrow(/time zone/i);

    expect(() =>
      resolveTimestamp({
        clientTime: 'not-a-timestamp',
        serverReceiptTime: '2026-09-01T00:00:05.000Z',
        validationResult: 'valid',
      }),
    ).toThrow(/client time/i);
  });
});
