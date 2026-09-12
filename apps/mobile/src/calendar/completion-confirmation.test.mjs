import { describe, expect, it } from 'vitest';

import {
  COMPLETION_CONFIRMATION_MOTION_MS,
  createCompletionConfirmationModel,
} from './completion-confirmation.js';

describe('MTS-061 completion confirmation copy matrix', () => {
  it.each([
    {
      name: 'positive XP without a level-up',
      input: { awardedXp: 86, totalXp: 186, language: 'en', reduceMotion: false },
      expected: 'Mission complete · +86 XP',
    },
    {
      name: 'zero XP without a reason',
      input: { awardedXp: 0, totalXp: 186, language: 'en', reduceMotion: false },
      expected: 'Mission complete · 0 XP',
    },
    {
      name: 'positive XP with the final level only',
      input: { awardedXp: 86, totalXp: 250, language: 'en', reduceMotion: false },
      expected: 'Mission complete · +86 XP · Level 3',
    },
    {
      name: 'Traditional Chinese positive XP',
      input: { awardedXp: 86, totalXp: 186, language: 'zh-HK', reduceMotion: false },
      expected: '任務完成 · +86 XP',
    },
    {
      name: 'Traditional Chinese zero XP',
      input: { awardedXp: 0, totalXp: 186, language: 'zh-HK', reduceMotion: false },
      expected: '任務完成 · 0 XP',
    },
  ])('$name', ({ input, expected }) => {
    expect(createCompletionConfirmationModel(input).message).toBe(expected);
  });

  it('never exposes a zero-XP reason or proof-bonus breakdown', () => {
    const model = createCompletionConfirmationModel({
      awardedXp: 0,
      totalXp: 250,
      language: 'en',
      reduceMotion: false,
    });

    expect(model.message).toBe('Mission complete · 0 XP');
    expect(model.message).not.toMatch(/reason|base|bonus/i);
  });
});

describe('MTS-061 level-up confirmation', () => {
  it('shows only the final level when one completion crosses multiple levels', () => {
    const model = createCompletionConfirmationModel({
      awardedXp: 1_000,
      totalXp: 1_000,
      language: 'en',
      reduceMotion: false,
    });

    expect(model.finalLevel).toBe(7);
    expect(model.message).toBe('Mission complete · +1,000 XP · Level 7');
    expect(model.message.match(/Level/g)).toHaveLength(1);
  });
});

describe('MTS-061 completion confirmation motion policy', () => {
  it('keeps standard completion motion within the required 600–900 ms window', () => {
    expect(COMPLETION_CONFIRMATION_MOTION_MS).toBeGreaterThanOrEqual(600);
    expect(COMPLETION_CONFIRMATION_MOTION_MS).toBeLessThanOrEqual(900);

    const model = createCompletionConfirmationModel({
      awardedXp: 86,
      totalXp: 186,
      language: 'en',
      reduceMotion: false,
    });

    expect(model.motion).toEqual({
      durationMs: COMPLETION_CONFIRMATION_MOTION_MS,
      transition: 'directional',
      showConfetti: false,
      scaleLevel: false,
    });
  });

  it('adds level-up emphasis within the same bounded confirmation', () => {
    const model = createCompletionConfirmationModel({
      awardedXp: 86,
      totalXp: 250,
      language: 'en',
      reduceMotion: false,
    });

    expect(model.motion.durationMs).toBeLessThanOrEqual(900);
    expect(model.motion.showConfetti).toBe(true);
    expect(model.motion.scaleLevel).toBe(true);
  });

  it('uses a static confirmation when Reduce Motion is enabled', () => {
    const model = createCompletionConfirmationModel({
      awardedXp: 86,
      totalXp: 250,
      language: 'en',
      reduceMotion: true,
    });

    expect(model.motion).toEqual({
      durationMs: 0,
      transition: 'fade',
      showConfetti: false,
      scaleLevel: false,
    });
    expect(model.message).toBe('Mission complete · +86 XP · Level 3');
  });
});
