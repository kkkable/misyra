import { describe, expect, it, vi } from 'vitest';

type RewardBasis = Readonly<{
  difficulty: 'easy' | 'normal' | 'hard' | null;
  baseXp: number;
  revokedAt: string | null;
}>;

type SaveInput = Readonly<{
  accountId: string;
  occurrenceId: string;
  currentRewardEligibility: 'undetermined' | 'eligible' | 'ineligible';
  scheduledStartInstant: string;
  targetStartInstant: string;
  savedAtInstant: string;
  changedFields: readonly ('title' | 'description' | 'estimated_duration' | 'schedule')[];
  task: Readonly<{
    title: string;
    description: string | null;
    estimatedDurationMinutes: number;
  }>;
}>;

type RewardBasisStore = Readonly<{
  find(accountId: string, occurrenceId: string): Promise<RewardBasis | null>;
  upsert(
    accountId: string,
    occurrenceId: string,
    basis: Readonly<{ difficulty: 'easy' | 'normal' | 'hard'; baseXp: number }>,
  ): Promise<RewardBasis>;
  revoke(accountId: string, occurrenceId: string, revokedAt: string): Promise<RewardBasis>;
}>;

type DifficultyClassifier = Readonly<{
  classifyBeforeStartSave(input: unknown): Promise<
    | Readonly<{ recalculated: false; result: null }>
    | Readonly<{
        recalculated: true;
        result: Readonly<{
          difficulty: 'easy' | 'normal' | 'hard';
          internalMissionType: string | null;
          explanation: string | null;
          confidence: number;
          modelVersion: string;
          classificationSource: 'ai' | 'fallback';
        }>;
      }>
  >;
}>;

type RewardLockingService = Readonly<{
  save(input: SaveInput): Promise<Readonly<{ action: string; basis: RewardBasis | null }>>;
}>;

type CreateRewardLockingService = (input: {
  classifier: DifficultyClassifier;
  store: RewardBasisStore;
}) => RewardLockingService;

type ApiModule = Record<string, unknown>;

async function loadServiceFactory(): Promise<CreateRewardLockingService> {
  const module = (await import('./index.js')) as ApiModule;
  const factory = module.createRewardLockingService;
  if (typeof factory !== 'function') {
    throw new TypeError('Missing required API function: createRewardLockingService');
  }
  return factory as CreateRewardLockingService;
}

const task = {
  title: 'Prepare quarterly presentation',
  description: 'Review metrics and rehearse',
  estimatedDurationMinutes: 90,
};

const baseInput: SaveInput = {
  accountId: '11111111-1111-4111-8111-111111111111',
  occurrenceId: '22222222-2222-4222-8222-222222222222',
  currentRewardEligibility: 'eligible',
  scheduledStartInstant: '2026-09-12T09:00:00.000Z',
  targetStartInstant: '2026-09-12T09:00:00.000Z',
  savedAtInstant: '2026-09-11T09:00:00.000Z',
  changedFields: ['description'],
  task,
};

function createStore(initial: RewardBasis | null = null) {
  let basis = initial;
  const find = vi.fn(() => Promise.resolve(basis));
  const upsert = vi.fn(
    (
      _accountId: string,
      _occurrenceId: string,
      next: Readonly<{ difficulty: 'easy' | 'normal' | 'hard'; baseXp: number }>,
    ) => {
      basis = { ...next, revokedAt: null };
      return Promise.resolve(basis);
    },
  );
  const revoke = vi.fn((_accountId: string, _occurrenceId: string, revokedAt: string) => {
    basis = {
      difficulty: basis?.difficulty ?? null,
      baseXp: 0,
      revokedAt: basis?.revokedAt ?? revokedAt,
    };
    return Promise.resolve(basis);
  });
  return { store: { find, upsert, revoke } satisfies RewardBasisStore, find, upsert, revoke };
}

describe('MTS-057 reward locking service', () => {
  it('reclassifies a relevant before-start save and persists deterministic base XP', async () => {
    const createRewardLockingService = await loadServiceFactory();
    const classifier = {
      classifyBeforeStartSave: vi.fn(() =>
        Promise.resolve({
          recalculated: true as const,
          result: {
            difficulty: 'hard' as const,
            internalMissionType: 'presentation',
            explanation: 'High mental effort.',
            confidence: 0.9,
            modelVersion: 'fake-v1',
            classificationSource: 'ai' as const,
          },
        }),
      ),
    };
    const { store, upsert, revoke } = createStore({
      difficulty: 'normal',
      baseXp: 125,
      revokedAt: null,
    });
    const service = createRewardLockingService({ classifier, store });

    await expect(service.save(baseInput)).resolves.toEqual({
      action: 'recalculate',
      basis: { difficulty: 'hard', baseXp: 170, revokedAt: null },
    });
    expect(classifier.classifyBeforeStartSave).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(baseInput.accountId, baseInput.occurrenceId, {
      difficulty: 'hard',
      baseXp: 170,
    });
    expect(revoke).not.toHaveBeenCalled();
  });

  it('does not call AI for a schedule-only edit saved before start', async () => {
    const createRewardLockingService = await loadServiceFactory();
    const classifier = { classifyBeforeStartSave: vi.fn() } as unknown as DifficultyClassifier;
    const existing = { difficulty: 'normal' as const, baseXp: 125, revokedAt: null };
    const { store, upsert, revoke } = createStore(existing);
    const service = createRewardLockingService({ classifier, store });

    await expect(
      service.save({
        ...baseInput,
        targetStartInstant: '2026-09-12T10:00:00.000Z',
        changedFields: ['schedule'],
      }),
    ).resolves.toEqual({ action: 'unchanged', basis: existing });
    expect(classifier.classifyBeforeStartSave).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('revokes after-start edits without AI and never restores a revoked basis', async () => {
    const createRewardLockingService = await loadServiceFactory();
    const classifier = { classifyBeforeStartSave: vi.fn() } as unknown as DifficultyClassifier;
    const { store, upsert, revoke } = createStore({
      difficulty: 'hard',
      baseXp: 170,
      revokedAt: null,
    });
    const service = createRewardLockingService({ classifier, store });

    await expect(
      service.save({
        ...baseInput,
        targetStartInstant: '2026-09-12T11:00:00.000Z',
        savedAtInstant: '2026-09-12T10:00:00.000Z',
        changedFields: ['schedule'],
      }),
    ).resolves.toEqual({
      action: 'revoke',
      basis: {
        difficulty: 'hard',
        baseXp: 0,
        revokedAt: '2026-09-12T10:00:00.000Z',
      },
    });

    await expect(
      service.save({
        ...baseInput,
        currentRewardEligibility: 'ineligible',
        scheduledStartInstant: '2026-09-14T09:00:00.000Z',
        targetStartInstant: '2026-09-14T09:00:00.000Z',
        savedAtInstant: '2026-09-12T11:00:00.000Z',
        changedFields: ['description', 'schedule'],
      }),
    ).resolves.toEqual({
      action: 'revoke',
      basis: {
        difficulty: 'hard',
        baseXp: 0,
        revokedAt: '2026-09-12T10:00:00.000Z',
      },
    });

    expect(classifier.classifyBeforeStartSave).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});
