import { Temporal } from '@js-temporal/polyfill';

import type { MissionSchedule, RewardEligibility } from './mission-model.js';

const HISTORICAL_WINDOW_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

export interface CompletionEligibilityInput {
  readonly schedule: MissionSchedule;
  readonly actionInstant: string;
}

export type CompletionEligibilityState = 'not_started' | 'open' | 'expired';

export interface CompletionEligibilityResult {
  readonly state: CompletionEligibilityState;
  readonly opensAt: string;
  readonly expiresAt: string;
  readonly canStartCompletion: boolean;
  readonly readOnly: boolean;
  readonly canDelete: boolean;
  readonly canDuplicate: boolean;
}

export interface SchedulePlacementInput {
  readonly targetStartInstant: string;
  readonly actionInstant: string;
  readonly currentRewardEligibility: RewardEligibility;
}

export interface SchedulePlacementResult {
  readonly allowed: boolean;
  readonly rewardEligibility: RewardEligibility;
  readonly reason: 'allowed' | 'historical_window_exceeded';
}

export interface EditRewardEligibilityInput {
  readonly scheduledStartInstant: string;
  readonly savedAtInstant: string;
  readonly currentRewardEligibility: RewardEligibility;
}

function parseInstant(value: string, label: string): Temporal.Instant {
  try {
    return Temporal.Instant.from(value);
  } catch {
    throw new TypeError(`${label} must be a valid absolute timestamp.`);
  }
}

function parsePlainDateTime(value: string, label: string): Temporal.PlainDateTime {
  try {
    return Temporal.PlainDateTime.from(value);
  } catch {
    throw new TypeError(`${label} must be a valid local date-time.`);
  }
}

function toIsoInstant(instant: Temporal.Instant): string {
  return new Date(instant.epochMilliseconds).toISOString();
}

function completionExpiry(schedule: MissionSchedule): Temporal.Instant {
  const localFinish = parsePlainDateTime(schedule.localFinish, 'Schedule local finish');
  try {
    return localFinish.add({ days: 30 }).toZonedDateTime(schedule.timeZone).toInstant();
  } catch {
    throw new TypeError(
      `Schedule local finish could not be resolved in time zone ${schedule.timeZone}.`,
    );
  }
}

export function evaluateCompletionEligibility(
  input: CompletionEligibilityInput,
): CompletionEligibilityResult {
  const action = parseInstant(input.actionInstant, 'Action instant');
  const start = parseInstant(input.schedule.startInstant, 'Schedule start instant');
  parseInstant(input.schedule.finishInstant, 'Schedule finish instant');
  const expiry = completionExpiry(input.schedule);

  const actionVsStart = Temporal.Instant.compare(action, start);
  const actionVsExpiry = Temporal.Instant.compare(action, expiry);
  const state: CompletionEligibilityState =
    actionVsStart < 0 ? 'not_started' : actionVsExpiry >= 0 ? 'expired' : 'open';

  return Object.freeze({
    state,
    opensAt: toIsoInstant(start),
    expiresAt: toIsoInstant(expiry),
    canStartCompletion: state === 'open',
    readOnly: state === 'expired',
    canDelete: true,
    canDuplicate: true,
  });
}

export function evaluateSchedulePlacement(input: SchedulePlacementInput): SchedulePlacementResult {
  const targetStart = parseInstant(input.targetStartInstant, 'Target start instant');
  const action = parseInstant(input.actionInstant, 'Action instant');
  const ageMilliseconds = action.epochMilliseconds - targetStart.epochMilliseconds;

  if (ageMilliseconds > HISTORICAL_WINDOW_MILLISECONDS) {
    return Object.freeze({
      allowed: false,
      rewardEligibility: input.currentRewardEligibility,
      reason: 'historical_window_exceeded',
    });
  }

  return Object.freeze({
    allowed: true,
    rewardEligibility: ageMilliseconds > 0 ? 'ineligible' : input.currentRewardEligibility,
    reason: 'allowed',
  });
}

export function resolveRewardEligibilityAfterEdit(
  input: EditRewardEligibilityInput,
): RewardEligibility {
  if (input.currentRewardEligibility === 'ineligible') {
    return 'ineligible';
  }

  const scheduledStart = parseInstant(input.scheduledStartInstant, 'Scheduled start instant');
  const savedAt = parseInstant(input.savedAtInstant, 'Saved-at instant');

  return Temporal.Instant.compare(savedAt, scheduledStart) >= 0
    ? 'ineligible'
    : input.currentRewardEligibility;
}
