import { describe, expect, it } from 'vitest';

import {
  importedAllDayEffortEditRequestSchema,
  importedAllDayEffortEditResponseSchema,
  importedAllDayEffortEstimationRequestSchema,
  importedAllDayEffortEstimationResponseSchema,
} from './v1/imported-all-day-effort.js';

describe('MTS-055 imported all-day effort estimation contract', () => {
  it('accepts generic and untitled provider events without rewriting the provider title', () => {
    const generic = importedAllDayEffortEstimationRequestSchema.parse({
      providerTitle: 'Busy',
      providerDescription: null,
      providerLocation: null,
    });
    expect(generic.providerTitle).toBe('Busy');

    const untitled = importedAllDayEffortEstimationRequestSchema.parse({
      providerTitle: null,
      providerDescription: null,
      providerLocation: null,
    });
    expect(untitled.providerTitle).toBeNull();

    expect(
      importedAllDayEffortEstimationRequestSchema.safeParse({
        providerTitle: null,
        providerDescription: null,
        providerLocation: null,
        displayTitle: 'Untitled event',
      }).success,
    ).toBe(false);
  });

  it('requires an explicit read-only title boundary and a positive effort result', () => {
    expect(
      importedAllDayEffortEstimationResponseSchema.parse({
        providerTitle: 'Busy',
        titleReadOnly: true,
        estimatedEffortMinutes: 45,
        estimationSource: 'ai',
      }),
    ).toEqual({
      providerTitle: 'Busy',
      titleReadOnly: true,
      estimatedEffortMinutes: 45,
      estimationSource: 'ai',
    });

    expect(
      importedAllDayEffortEstimationResponseSchema.safeParse({
        providerTitle: 'Busy',
        titleReadOnly: false,
        estimatedEffortMinutes: 45,
        estimationSource: 'ai',
      }).success,
    ).toBe(false);
    expect(
      importedAllDayEffortEstimationResponseSchema.safeParse({
        providerTitle: null,
        titleReadOnly: true,
        estimatedEffortMinutes: 0,
        estimationSource: 'fallback',
      }).success,
    ).toBe(false);
  });

  it('defines the post-import effort edit boundary with authoritative save time', () => {
    const request = importedAllDayEffortEditRequestSchema.parse({
      scheduledStartInstant: '2026-09-10T09:00:00.000Z',
      savedAtInstant: '2026-09-10T09:30:00.000Z',
      currentRewardEligibility: 'eligible',
      currentEstimatedEffortMinutes: 30,
      estimatedEffortMinutes: 60,
    });
    expect(request.estimatedEffortMinutes).toBe(60);

    expect(
      importedAllDayEffortEditResponseSchema.parse({
        estimatedEffortMinutes: 60,
        rewardEligibility: 'ineligible',
      }),
    ).toEqual({ estimatedEffortMinutes: 60, rewardEligibility: 'ineligible' });
  });
});
