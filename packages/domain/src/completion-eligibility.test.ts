import { describe, expect, it } from 'vitest';

import * as domainModule from './index.js';
import type { MissionSchedule, RewardEligibility } from './mission-model.js';

interface CompletionEligibilityInput {
  readonly schedule: MissionSchedule;
  readonly actionInstant: string;
}

interface CompletionEligibilityResult {
  readonly state: 'not_started' | 'open' | 'expired';
  readonly opensAt: string;
  readonly expiresAt: string;
  readonly canStartCompletion: boolean;
  readonly readOnly: boolean;
  readonly canDelete: boolean;
  readonly canDuplicate: boolean;
}

interface SchedulePlacementInput {
  readonly targetStartInstant: string;
  readonly actionInstant: string;
  readonly currentRewardEligibility: RewardEligibility;
}

interface SchedulePlacementResult {
  readonly allowed: boolean;
  readonly rewardEligibility: RewardEligibility;
  readonly reason: 'allowed' | 'historical_window_exceeded';
}

interface EditRewardEligibilityInput {
  readonly scheduledStartInstant: string;
  readonly savedAtInstant: string;
  readonly currentRewardEligibility: RewardEligibility;
}

type EvaluateCompletionEligibility = (
  input: CompletionEligibilityInput,
) => CompletionEligibilityResult;
type EvaluateSchedulePlacement = (input: SchedulePlacementInput) => SchedulePlacementResult;
type ResolveEditRewardEligibility = (input: EditRewardEligibilityInput) => RewardEligibility;
type CreateTimedSchedule = (input: {
  readonly localStart: string;
  readonly localFinish: string;
  readonly timeZone: string;
  readonly timeBehavior: 'local_time' | 'fixed_instant';
}) => MissionSchedule;
type CreateAllDaySchedule = (input: {
  readonly localDate: string;
  readonly timeZone: string;
  readonly estimatedEffortMinutes: number;
}) => MissionSchedule;

const module = domainModule as unknown as Record<string, unknown>;

function isEvaluateCompletionEligibility(value: unknown): value is EvaluateCompletionEligibility {
  return typeof value === 'function';
}

function isEvaluateSchedulePlacement(value: unknown): value is EvaluateSchedulePlacement {
  return typeof value === 'function';
}

function isResolveEditRewardEligibility(value: unknown): value is ResolveEditRewardEligibility {
  return typeof value === 'function';
}

function isCreateTimedSchedule(value: unknown): value is CreateTimedSchedule {
  return typeof value === 'function';
}

function isCreateAllDaySchedule(value: unknown): value is CreateAllDaySchedule {
  return typeof value === 'function';
}

function evaluateCompletion(input: CompletionEligibilityInput): CompletionEligibilityResult {
  const candidate = module['evaluateCompletionEligibility'];
  if (!isEvaluateCompletionEligibility(candidate)) {
    throw new TypeError('Missing required domain function: evaluateCompletionEligibility');
  }
  return candidate(input);
}

function evaluatePlacement(input: SchedulePlacementInput): SchedulePlacementResult {
  const candidate = module['evaluateSchedulePlacement'];
  if (!isEvaluateSchedulePlacement(candidate)) {
    throw new TypeError('Missing required domain function: evaluateSchedulePlacement');
  }
  return candidate(input);
}

function resolveEditEligibility(input: EditRewardEligibilityInput): RewardEligibility {
  const candidate = module['resolveRewardEligibilityAfterEdit'];
  if (!isResolveEditRewardEligibility(candidate)) {
    throw new TypeError('Missing required domain function: resolveRewardEligibilityAfterEdit');
  }
  return candidate(input);
}

function createTimedSchedule(input: Parameters<CreateTimedSchedule>[0]): MissionSchedule {
  const candidate = module['createZonedTimedSchedule'];
  if (!isCreateTimedSchedule(candidate)) {
    throw new TypeError('Missing required domain function: createZonedTimedSchedule');
  }
  return candidate(input);
}

function createAllDaySchedule(input: Parameters<CreateAllDaySchedule>[0]): MissionSchedule {
  const candidate = module['createZonedAllDaySchedule'];
  if (!isCreateAllDaySchedule(candidate)) {
    throw new TypeError('Missing required domain function: createZonedAllDaySchedule');
  }
  return candidate(input);
}

describe('MTS-017 mission completion eligibility', () => {
  it('blocks completion before start and opens it at the exact timed start instant', () => {
    const schedule = createTimedSchedule({
      localStart: '2026-09-01T09:00:00',
      localFinish: '2026-09-01T10:00:00',
      timeZone: 'Asia/Tokyo',
      timeBehavior: 'local_time',
    });

    expect(
      evaluateCompletion({ schedule, actionInstant: '2026-09-01T00:00:00.000Z' }),
    ).toMatchObject({
      state: 'open',
      canStartCompletion: true,
      readOnly: false,
    });
    expect(
      evaluateCompletion({ schedule, actionInstant: '2026-08-31T23:59:59.999Z' }),
    ).toMatchObject({
      state: 'not_started',
      canStartCompletion: false,
      readOnly: false,
    });
  });

  it('keeps completion open until one millisecond before expiry and closes at exact expiry', () => {
    const schedule = createTimedSchedule({
      localStart: '2026-09-01T09:00:00',
      localFinish: '2026-09-01T10:00:00',
      timeZone: 'Asia/Tokyo',
      timeBehavior: 'local_time',
    });

    expect(
      evaluateCompletion({ schedule, actionInstant: '2026-10-01T00:59:59.999Z' }),
    ).toMatchObject({
      state: 'open',
      canStartCompletion: true,
      readOnly: false,
    });
    expect(
      evaluateCompletion({ schedule, actionInstant: '2026-10-01T01:00:00.000Z' }),
    ).toEqual({
      state: 'expired',
      opensAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2026-10-01T01:00:00.000Z',
      canStartCompletion: false,
      readOnly: true,
      canDelete: true,
      canDuplicate: true,
    });
  });

  it('computes expiry as 30 local calendar days in the saved zone across DST', () => {
    const schedule = createTimedSchedule({
      localStart: '2026-02-20T09:00:00',
      localFinish: '2026-02-20T10:00:00',
      timeZone: 'America/New_York',
      timeBehavior: 'local_time',
    });

    const result = evaluateCompletion({
      schedule,
      actionInstant: '2026-03-22T13:59:59.999Z',
    });

    expect(schedule.finishInstant).toBe('2026-02-20T15:00:00.000Z');
    expect(result.expiresAt).toBe('2026-03-22T14:00:00.000Z');
    expect(Date.parse(result.expiresAt) - Date.parse(schedule.finishInstant)).toBe(
      30 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000,
    );
    expect(result.state).toBe('open');
  });

  it('uses all-day local midnight boundaries for start and expiry', () => {
    const schedule = createAllDaySchedule({
      localDate: '2026-03-08',
      timeZone: 'America/New_York',
      estimatedEffortMinutes: 45,
    });

    expect(
      evaluateCompletion({ schedule, actionInstant: '2026-03-08T04:59:59.999Z' }),
    ).toMatchObject({ state: 'not_started', canStartCompletion: false });
    expect(
      evaluateCompletion({ schedule, actionInstant: '2026-03-08T05:00:00.000Z' }),
    ).toMatchObject({ state: 'open', canStartCompletion: true });

    const expired = evaluateCompletion({
      schedule,
      actionInstant: '2026-04-08T04:00:00.000Z',
    });
    expect(expired.expiresAt).toBe('2026-04-08T04:00:00.000Z');
    expect(expired).toMatchObject({
      state: 'expired',
      canStartCompletion: false,
      readOnly: true,
      canDelete: true,
      canDuplicate: true,
    });
  });

  it('allows exactly 30-day-old creation or movement but permanently removes XP eligibility', () => {
    const actionInstant = '2026-09-30T12:00:00.000Z';
    const targetStartInstant = '2026-08-31T12:00:00.000Z';

    expect(
      evaluatePlacement({
        targetStartInstant,
        actionInstant,
        currentRewardEligibility: 'eligible',
      }),
    ).toEqual({
      allowed: true,
      rewardEligibility: 'ineligible',
      reason: 'allowed',
    });
  });

  it('rejects creation or movement more than 30 days into the past', () => {
    expect(
      evaluatePlacement({
        targetStartInstant: '2026-08-31T11:59:59.999Z',
        actionInstant: '2026-09-30T12:00:00.000Z',
        currentRewardEligibility: 'eligible',
      }),
    ).toEqual({
      allowed: false,
      rewardEligibility: 'eligible',
      reason: 'historical_window_exceeded',
    });
  });

  it('does not restore XP eligibility after a historical mission is moved back to the future', () => {
    expect(
      evaluatePlacement({
        targetStartInstant: '2026-10-01T12:00:00.000Z',
        actionInstant: '2026-09-30T12:00:00.000Z',
        currentRewardEligibility: 'ineligible',
      }),
    ).toEqual({
      allowed: true,
      rewardEligibility: 'ineligible',
      reason: 'allowed',
    });
  });

  it('makes an edit at the exact scheduled start permanently XP-ineligible', () => {
    expect(
      resolveEditEligibility({
        scheduledStartInstant: '2026-09-01T00:00:00.000Z',
        savedAtInstant: '2026-08-31T23:59:59.999Z',
        currentRewardEligibility: 'eligible',
      }),
    ).toBe('eligible');

    expect(
      resolveEditEligibility({
        scheduledStartInstant: '2026-09-01T00:00:00.000Z',
        savedAtInstant: '2026-09-01T00:00:00.000Z',
        currentRewardEligibility: 'eligible',
      }),
    ).toBe('ineligible');

    expect(
      resolveEditEligibility({
        scheduledStartInstant: '2026-10-01T00:00:00.000Z',
        savedAtInstant: '2026-09-01T00:00:00.000Z',
        currentRewardEligibility: 'ineligible',
      }),
    ).toBe('ineligible');
  });
});
