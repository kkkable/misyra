import { resolveRewardEligibilityAfterEdit } from './completion-eligibility.js';
import type { RewardEligibility } from './mission-model.js';

export const DEFAULT_IMPORTED_ALL_DAY_EFFORT_MINUTES = 30 as const;

export type ImportedAllDayEffortEstimationSource = 'ai' | 'fallback';

export interface ImportedAllDayEffortEstimateInput {
  readonly providerTitle: string | null;
  readonly aiEstimatedEffortMinutes: number | null;
}

export interface ImportedAllDayEffortEstimateResult {
  readonly providerTitle: string | null;
  readonly titleReadOnly: true;
  readonly estimatedEffortMinutes: number;
  readonly estimationSource: ImportedAllDayEffortEstimationSource;
}

export interface ImportedAllDayEffortEditInput {
  readonly scheduledStartInstant: string;
  readonly savedAtInstant: string;
  readonly currentRewardEligibility: RewardEligibility;
  readonly currentEstimatedEffortMinutes: number;
  readonly estimatedEffortMinutes: number;
}

export interface ImportedAllDayEffortEditResult {
  readonly estimatedEffortMinutes: number;
  readonly rewardEligibility: RewardEligibility;
}

function assertPositiveEffortMinutes(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
}

export function resolveImportedAllDayEffortEstimate(
  input: ImportedAllDayEffortEstimateInput,
): ImportedAllDayEffortEstimateResult {
  if (input.aiEstimatedEffortMinutes === null) {
    return Object.freeze({
      providerTitle: input.providerTitle,
      titleReadOnly: true,
      estimatedEffortMinutes: DEFAULT_IMPORTED_ALL_DAY_EFFORT_MINUTES,
      estimationSource: 'fallback',
    });
  }

  assertPositiveEffortMinutes(input.aiEstimatedEffortMinutes, 'AI estimated effort minutes');

  return Object.freeze({
    providerTitle: input.providerTitle,
    titleReadOnly: true,
    estimatedEffortMinutes: input.aiEstimatedEffortMinutes,
    estimationSource: 'ai',
  });
}

export function resolveImportedAllDayEffortEdit(
  input: ImportedAllDayEffortEditInput,
): ImportedAllDayEffortEditResult {
  assertPositiveEffortMinutes(
    input.currentEstimatedEffortMinutes,
    'Current estimated effort minutes',
  );
  assertPositiveEffortMinutes(input.estimatedEffortMinutes, 'Estimated effort minutes');

  const effortChanged = input.currentEstimatedEffortMinutes !== input.estimatedEffortMinutes;
  const rewardEligibility = effortChanged
    ? resolveRewardEligibilityAfterEdit({
        scheduledStartInstant: input.scheduledStartInstant,
        savedAtInstant: input.savedAtInstant,
        currentRewardEligibility: input.currentRewardEligibility,
      })
    : input.currentRewardEligibility;

  return Object.freeze({
    estimatedEffortMinutes: input.estimatedEffortMinutes,
    rewardEligibility,
  });
}
