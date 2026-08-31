export type MissionDifficulty = 'easy' | 'normal' | 'hard';
export type RewardPath =
  | 'verified_on_time'
  | 'verified_late'
  | 'self_confirmed'
  | 'private'
  | 'trust_mode'
  | 'ineligible'
  | 'unfinished';

export interface LevelProgress {
  readonly level: number;
  readonly xpIntoLevel: number;
  readonly xpToNextLevel: number;
}

function rewardDifficultyMultiplier(difficulty: string): number {
  switch (difficulty) {
    case 'easy':
      return 0.7;
    case 'normal':
      return 1;
    case 'hard':
      return 1.35;
    default:
      throw new TypeError('Invalid mission difficulty.');
  }
}

export function calculateBaseXp(estimatedMinutes: number, difficulty: string): number {
  if (!Number.isFinite(estimatedMinutes) || estimatedMinutes < 0) {
    throw new RangeError('Estimated minutes must be a finite non-negative number.');
  }

  const effectiveMinutes = Math.min(180, Math.max(5, estimatedMinutes));
  const timeScore = 10 + 1.3 * effectiveMinutes;
  const roundedXp = Math.round((timeScore * rewardDifficultyMultiplier(difficulty)) / 5) * 5;
  return Math.min(250, roundedXp);
}

export function calculateAwardedXp(baseXp: number, rewardPath: string): number {
  if (!Number.isSafeInteger(baseXp) || baseXp < 0) {
    throw new RangeError('Base XP must be a non-negative safe integer.');
  }

  switch (rewardPath) {
    case 'verified_on_time':
    case 'verified_late':
      return Math.round(baseXp * 1.15);
    case 'self_confirmed':
    case 'private':
    case 'trust_mode':
      return baseXp;
    case 'ineligible':
    case 'unfinished':
      return 0;
    default:
      throw new TypeError('Invalid reward path.');
  }
}

export function calculateLevelProgress(totalXp: number): LevelProgress {
  if (!Number.isSafeInteger(totalXp) || totalXp < 0) {
    throw new RangeError('Total XP must be a non-negative safe integer.');
  }

  let level = 1;
  let xpIntoLevel = totalXp;
  let xpToNextLevel = 100;

  while (xpIntoLevel >= xpToNextLevel) {
    xpIntoLevel -= xpToNextLevel;
    level += 1;
    xpToNextLevel = 100 + 25 * (level - 1);
  }

  return Object.freeze({ level, xpIntoLevel, xpToNextLevel });
}
