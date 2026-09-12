import { duration } from '@misyra/design-tokens';
import { calculateLevelProgress } from '@misyra/domain';
import {
  completionConfirmationCatalogs,
  type LocalizationLocale,
} from '@misyra/localization';

export const COMPLETION_CONFIRMATION_MOTION_MS = duration.celebrationMin;

export type CompletionConfirmationMotion = Readonly<{
  durationMs: number;
  transition: 'directional' | 'fade';
  showConfetti: boolean;
  scaleLevel: boolean;
}>;

export type CompletionConfirmationModel = Readonly<{
  message: string;
  finalLevel: number | null;
  motion: CompletionConfirmationMotion;
}>;

export type CompletionConfirmationModelInput = Readonly<{
  awardedXp: number;
  totalXp: number;
  language: LocalizationLocale;
  reduceMotion: boolean;
  numberLocale?: string;
}>;

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function formatNumber(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return new Intl.NumberFormat('en').format(value);
  }
}

function replaceValue(template: string, value: string): string {
  return template.replace('{value}', value);
}

export function createCompletionConfirmationModel(
  input: CompletionConfirmationModelInput,
): CompletionConfirmationModel {
  const awardedXp = nonNegativeInteger(input.awardedXp, 'Awarded XP');
  const totalXp = nonNegativeInteger(input.totalXp, 'Total XP');
  if (awardedXp > totalXp) {
    throw new RangeError('Awarded XP must not exceed total XP.');
  }

  const catalog = completionConfirmationCatalogs[input.language];
  const locale = input.numberLocale ?? input.language;
  const previousTotalXp = totalXp - awardedXp;
  const previousLevel = calculateLevelProgress(previousTotalXp).level;
  const currentLevel = calculateLevelProgress(totalXp).level;
  const levelUp = awardedXp > 0 && currentLevel > previousLevel;
  const formattedXp = formatNumber(awardedXp, locale);
  const xpSegment = awardedXp === 0 ? '0 XP' : `+${formattedXp} XP`;
  const segments = [catalog.missionComplete, xpSegment];

  if (levelUp) {
    segments.push(replaceValue(catalog.level, formatNumber(currentLevel, locale)));
  }

  return Object.freeze({
    message: segments.join(' · '),
    finalLevel: levelUp ? currentLevel : null,
    motion: input.reduceMotion
      ? Object.freeze({
          durationMs: 0,
          transition: 'fade' as const,
          showConfetti: false,
          scaleLevel: false,
        })
      : Object.freeze({
          durationMs: COMPLETION_CONFIRMATION_MOTION_MS,
          transition: 'directional' as const,
          showConfetti: levelUp,
          scaleLevel: levelUp,
        }),
  });
}
