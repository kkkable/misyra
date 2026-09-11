import type { MissionDifficulty } from './reward.js';

export type RewardBasis = Readonly<{
  difficulty: MissionDifficulty | null;
  baseXp: number;
  revokedAt: string | null;
}>;

export type RewardBasisSaveField =
  | 'title'
  | 'description'
  | 'estimated_duration'
  | 'schedule';

export type RewardBasisSaveAction = 'recalculate' | 'locked' | 'revoke' | 'unchanged';

export type RewardBasisSaveDecision = Readonly<{
  action: RewardBasisSaveAction;
}>;

export type RewardBasisSaveInput = Readonly<{
  currentRewardEligibility: 'undetermined' | 'eligible' | 'ineligible';
  currentBasis: RewardBasis | null;
  scheduledStartInstant: string;
  targetStartInstant: string;
  savedAtInstant: string;
  changedFields: readonly RewardBasisSaveField[];
}>;

const RELEVANT_RECALCULATION_FIELDS = new Set<RewardBasisSaveField>([
  'title',
  'description',
  'estimated_duration',
]);

function parseInstant(value: string, field: string): number {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) {
    throw new RangeError(`${field} must be a valid instant`);
  }
  return instant;
}

export function resolveRewardBasisAfterSave(
  input: RewardBasisSaveInput,
): RewardBasisSaveDecision {
  if (input.currentRewardEligibility === 'ineligible' || input.currentBasis?.revokedAt != null) {
    return { action: 'revoke' };
  }

  const scheduledStart = parseInstant(input.scheduledStartInstant, 'scheduledStartInstant');
  const targetStart = parseInstant(input.targetStartInstant, 'targetStartInstant');
  const savedAt = parseInstant(input.savedAtInstant, 'savedAtInstant');
  const hasAnyEdit = input.changedFields.length > 0;

  if ((hasAnyEdit && savedAt >= scheduledStart) || targetStart < savedAt) {
    return { action: 'revoke' };
  }

  if (savedAt >= scheduledStart) {
    return { action: 'locked' };
  }

  if (input.changedFields.some((field) => RELEVANT_RECALCULATION_FIELDS.has(field))) {
    return { action: 'recalculate' };
  }

  return { action: 'unchanged' };
}
