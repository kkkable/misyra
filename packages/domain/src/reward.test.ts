import { describe, expect, it } from 'vitest';

type DomainModule = Record<string, unknown>;
type DomainFunction = (...args: unknown[]) => unknown;

function requireFunction(module: DomainModule, name: string): DomainFunction {
  const value = module[name];
  if (typeof value !== 'function') {
    throw new TypeError(`Missing required reward function: ${name}`);
  }
  return value as DomainFunction;
}

async function loadRewardFunctions() {
  const module = (await import('./index.js')) as DomainModule;
  return {
    calculateBaseXp: requireFunction(module, 'calculateBaseXp'),
    calculateAwardedXp: requireFunction(module, 'calculateAwardedXp'),
    calculateLevelProgress: requireFunction(module, 'calculateLevelProgress'),
  };
}

describe('MTS-018 XP, proof bonus, and levels contract', () => {
  it.each([
    ['easy', 5, 10],
    ['normal', 5, 15],
    ['hard', 5, 20],
    ['easy', 30, 35],
    ['normal', 30, 50],
    ['hard', 30, 65],
    ['easy', 60, 60],
    ['normal', 60, 90],
    ['hard', 60, 120],
  ])('calculates %s difficulty at %i minutes as %i base XP', async (difficulty, minutes, expected) => {
    const { calculateBaseXp } = await loadRewardFunctions();
    expect(calculateBaseXp(minutes, difficulty)).toBe(expected);
  });

  it('clamps duration, rounds to the nearest five, and caps base XP at 250', async () => {
    const { calculateBaseXp } = await loadRewardFunctions();

    expect(calculateBaseXp(1, 'normal')).toBe(15);
    expect(calculateBaseXp(6, 'normal')).toBe(20);
    expect(calculateBaseXp(179, 'normal')).toBe(245);
    expect(calculateBaseXp(180, 'hard')).toBe(250);
    expect(calculateBaseXp(600, 'hard')).toBe(250);
  });

  it('gives both on-time and late accepted evidence the fixed 15% proof bonus', async () => {
    const { calculateAwardedXp } = await loadRewardFunctions();

    expect(calculateAwardedXp(75, 'verified_on_time')).toBe(86);
    expect(calculateAwardedXp(75, 'verified_late')).toBe(86);
    expect(calculateAwardedXp(75, 'self_confirmed')).toBe(75);
    expect(calculateAwardedXp(75, 'private')).toBe(75);
    expect(calculateAwardedXp(75, 'trust_mode')).toBe(75);
    expect(calculateAwardedXp(75, 'ineligible')).toBe(0);
    expect(calculateAwardedXp(75, 'unfinished')).toBe(0);
  });

  it('calculates unlimited level progress and consumes multiple thresholds in one gain', async () => {
    const { calculateLevelProgress } = await loadRewardFunctions();

    expect(calculateLevelProgress(0)).toEqual({
      level: 1,
      xpIntoLevel: 0,
      xpToNextLevel: 100,
    });
    expect(calculateLevelProgress(99)).toEqual({
      level: 1,
      xpIntoLevel: 99,
      xpToNextLevel: 100,
    });
    expect(calculateLevelProgress(100)).toEqual({
      level: 2,
      xpIntoLevel: 0,
      xpToNextLevel: 125,
    });
    expect(calculateLevelProgress(225)).toEqual({
      level: 3,
      xpIntoLevel: 0,
      xpToNextLevel: 150,
    });
    expect(calculateLevelProgress(400)).toEqual({
      level: 4,
      xpIntoLevel: 25,
      xpToNextLevel: 175,
    });
    expect(calculateLevelProgress(100_000)).toMatchObject({
      level: 87,
      xpIntoLevel: 25,
      xpToNextLevel: 2250,
    });
  });

  it('rejects invalid domain inputs instead of creating alternate reward behavior', async () => {
    const { calculateAwardedXp, calculateBaseXp, calculateLevelProgress } =
      await loadRewardFunctions();

    expect(() => calculateBaseXp(Number.NaN, 'normal')).toThrow();
    expect(() => calculateBaseXp(30, 'legendary')).toThrow();
    expect(() => calculateAwardedXp(-5, 'private')).toThrow();
    expect(() => calculateAwardedXp(50, 'mystery')).toThrow();
    expect(() => calculateLevelProgress(-1)).toThrow();
    expect(() => calculateLevelProgress(1.5)).toThrow();
  });
});
