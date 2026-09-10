import { describe, expect, it } from 'vitest';

import {
  DEFAULT_IMPORTED_ALL_DAY_EFFORT_MINUTES,
  resolveImportedAllDayEffortEdit,
  resolveImportedAllDayEffortEstimate,
} from './imported-all-day-effort.js';

describe('MTS-055 imported all-day effort fallback', () => {
  it('uses the 30-minute fallback when the one-time AI estimate is unavailable', () => {
    expect(DEFAULT_IMPORTED_ALL_DAY_EFFORT_MINUTES).toBe(30);
    expect(
      resolveImportedAllDayEffortEstimate({
        providerTitle: null,
        aiEstimatedEffortMinutes: null,
      }),
    ).toEqual({
      providerTitle: null,
      titleReadOnly: true,
      estimatedEffortMinutes: 30,
      estimationSource: 'fallback',
    });
  });

  it('preserves generic provider titles and a valid AI effort estimate', () => {
    expect(
      resolveImportedAllDayEffortEstimate({
        providerTitle: 'Busy',
        aiEstimatedEffortMinutes: 75,
      }),
    ).toEqual({
      providerTitle: 'Busy',
      titleReadOnly: true,
      estimatedEffortMinutes: 75,
      estimationSource: 'ai',
    });
  });

  it('rejects invalid AI effort values instead of storing them', () => {
    expect(() =>
      resolveImportedAllDayEffortEstimate({
        providerTitle: 'Busy',
        aiEstimatedEffortMinutes: 0,
      }),
    ).toThrow('AI estimated effort minutes must be a positive integer.');
    expect(() =>
      resolveImportedAllDayEffortEstimate({
        providerTitle: 'Busy',
        aiEstimatedEffortMinutes: 12.5,
      }),
    ).toThrow('AI estimated effort minutes must be a positive integer.');
  });
});

describe('MTS-055 imported all-day effort edit semantics', () => {
  const base = {
    scheduledStartInstant: '2026-09-10T09:00:00.000Z',
    currentRewardEligibility: 'eligible',
    currentEstimatedEffortMinutes: 30,
    estimatedEffortMinutes: 60,
  } as const;

  it('keeps XP eligibility when effort is changed before mission start', () => {
    expect(
      resolveImportedAllDayEffortEdit({
        ...base,
        savedAtInstant: '2026-09-10T08:59:59.999Z',
      }),
    ).toEqual({ estimatedEffortMinutes: 60, rewardEligibility: 'eligible' });
  });

  it('permanently removes XP eligibility when effort changes at or after start', () => {
    expect(
      resolveImportedAllDayEffortEdit({
        ...base,
        savedAtInstant: '2026-09-10T09:00:00.000Z',
      }),
    ).toEqual({ estimatedEffortMinutes: 60, rewardEligibility: 'ineligible' });

    expect(
      resolveImportedAllDayEffortEdit({
        ...base,
        currentRewardEligibility: 'ineligible',
        savedAtInstant: '2026-09-10T08:00:00.000Z',
      }),
    ).toEqual({ estimatedEffortMinutes: 60, rewardEligibility: 'ineligible' });
  });

  it('does not remove XP when the effort value did not change', () => {
    expect(
      resolveImportedAllDayEffortEdit({
        ...base,
        currentEstimatedEffortMinutes: 60,
        savedAtInstant: '2026-09-10T09:30:00.000Z',
      }),
    ).toEqual({ estimatedEffortMinutes: 60, rewardEligibility: 'eligible' });
  });
});
