import { describe, expect, it } from 'vitest';

type RewardEligibility = 'undetermined' | 'eligible' | 'ineligible';
type RewardBasis = Readonly<{
  difficulty: 'easy' | 'normal' | 'hard' | null;
  baseXp: number;
  revokedAt: string | null;
}>;
type RewardBasisSaveDecision = Readonly<{
  action: 'recalculate' | 'locked' | 'revoke' | 'unchanged';
}>;
type ResolveRewardBasisAfterSave = (input: {
  currentRewardEligibility: RewardEligibility;
  currentBasis: RewardBasis | null;
  scheduledStartInstant: string;
  targetStartInstant: string;
  savedAtInstant: string;
  changedFields: readonly ('title' | 'description' | 'estimated_duration' | 'schedule')[];
}) => RewardBasisSaveDecision;

type DomainModule = Record<string, unknown>;

async function loadResolver(): Promise<ResolveRewardBasisAfterSave> {
  const module = (await import('./index.js')) as DomainModule;
  const resolver = module.resolveRewardBasisAfterSave;
  if (typeof resolver !== 'function') {
    throw new TypeError('Missing required domain function: resolveRewardBasisAfterSave');
  }
  return resolver as ResolveRewardBasisAfterSave;
}

const currentBasis: RewardBasis = {
  difficulty: 'normal',
  baseXp: 125,
  revokedAt: null,
};

describe('MTS-057 reward locking domain rules', () => {
  it('requests recalculation only for relevant eligible edits saved before start', async () => {
    const resolveRewardBasisAfterSave = await loadResolver();

    expect(
      resolveRewardBasisAfterSave({
        currentRewardEligibility: 'eligible',
        currentBasis,
        scheduledStartInstant: '2026-09-12T09:00:00.000Z',
        targetStartInstant: '2026-09-12T09:00:00.000Z',
        savedAtInstant: '2026-09-11T09:00:00.000Z',
        changedFields: ['description'],
      }),
    ).toEqual({ action: 'recalculate' });

    expect(
      resolveRewardBasisAfterSave({
        currentRewardEligibility: 'eligible',
        currentBasis: null,
        scheduledStartInstant: '2026-09-12T09:00:00.000Z',
        targetStartInstant: '2026-09-12T09:00:00.000Z',
        savedAtInstant: '2026-09-11T09:00:00.000Z',
        changedFields: ['title'],
      }),
    ).toEqual({ action: 'recalculate' });

    expect(
      resolveRewardBasisAfterSave({
        currentRewardEligibility: 'eligible',
        currentBasis,
        scheduledStartInstant: '2026-09-12T09:00:00.000Z',
        targetStartInstant: '2026-09-12T10:00:00.000Z',
        savedAtInstant: '2026-09-11T09:00:00.000Z',
        changedFields: ['schedule'],
      }),
    ).toEqual({ action: 'unchanged' });
  });

  it('locks the existing reward basis at the exact scheduled start when nothing changed', async () => {
    const resolveRewardBasisAfterSave = await loadResolver();

    expect(
      resolveRewardBasisAfterSave({
        currentRewardEligibility: 'eligible',
        currentBasis,
        scheduledStartInstant: '2026-09-12T09:00:00.000Z',
        targetStartInstant: '2026-09-12T09:00:00.000Z',
        savedAtInstant: '2026-09-12T09:00:00.000Z',
        changedFields: [],
      }),
    ).toEqual({ action: 'locked' });
  });

  it('permanently revokes reward on an after-start edit or move into the past', async () => {
    const resolveRewardBasisAfterSave = await loadResolver();

    expect(
      resolveRewardBasisAfterSave({
        currentRewardEligibility: 'eligible',
        currentBasis,
        scheduledStartInstant: '2026-09-12T09:00:00.000Z',
        targetStartInstant: '2026-09-12T11:00:00.000Z',
        savedAtInstant: '2026-09-12T10:00:00.000Z',
        changedFields: ['schedule'],
      }),
    ).toEqual({ action: 'revoke' });

    expect(
      resolveRewardBasisAfterSave({
        currentRewardEligibility: 'eligible',
        currentBasis,
        scheduledStartInstant: '2026-09-13T09:00:00.000Z',
        targetStartInstant: '2026-09-11T08:00:00.000Z',
        savedAtInstant: '2026-09-11T09:00:00.000Z',
        changedFields: ['schedule'],
      }),
    ).toEqual({ action: 'revoke' });
  });

  it('never restores a previously revoked reward even after moving back to the future', async () => {
    const resolveRewardBasisAfterSave = await loadResolver();

    expect(
      resolveRewardBasisAfterSave({
        currentRewardEligibility: 'ineligible',
        currentBasis: { difficulty: 'normal', baseXp: 0, revokedAt: '2026-09-11T09:00:00.000Z' },
        scheduledStartInstant: '2026-09-13T09:00:00.000Z',
        targetStartInstant: '2026-09-14T09:00:00.000Z',
        savedAtInstant: '2026-09-11T10:00:00.000Z',
        changedFields: ['description', 'schedule'],
      }),
    ).toEqual({ action: 'revoke' });
  });
});
