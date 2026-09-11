import {
  createRewardBasisStore,
  runRewardBasisTransaction,
  type RewardBasisRow,
} from '@misyra/database';
import {
  calculateBaseXp,
  resolveRewardBasisAfterSave,
  type MissionDifficulty,
  type RewardBasisSaveField,
} from '@misyra/domain';
import type { Pool } from 'pg';

import type { DifficultyClassificationService } from './ai-difficulty-classification.js';

export type StoredRewardBasis = Readonly<{
  difficulty: MissionDifficulty | null;
  baseXp: number;
  revokedAt: string | null;
}>;

export interface RewardBasisStore {
  find(accountId: string, occurrenceId: string): Promise<StoredRewardBasis | null>;
  upsert(
    accountId: string,
    occurrenceId: string,
    basis: Readonly<{ difficulty: MissionDifficulty; baseXp: number }>,
  ): Promise<StoredRewardBasis>;
  revoke(accountId: string, occurrenceId: string, revokedAt: string): Promise<StoredRewardBasis>;
}

export type RewardLockingSaveInput = Readonly<{
  accountId: string;
  occurrenceId: string;
  currentRewardEligibility: 'undetermined' | 'eligible' | 'ineligible';
  scheduledStartInstant: string;
  targetStartInstant: string;
  savedAtInstant: string;
  changedFields: readonly RewardBasisSaveField[];
  task: Readonly<{
    title: string;
    description: string | null;
    estimatedDurationMinutes: number;
  }>;
}>;

export interface RewardLockingService {
  save(
    input: RewardLockingSaveInput,
  ): Promise<
    Readonly<{
      action: 'recalculate' | 'locked' | 'revoke' | 'unchanged';
      basis: StoredRewardBasis | null;
    }>
  >;
}

function mapDatabaseBasis(row: RewardBasisRow): StoredRewardBasis {
  return Object.freeze({
    difficulty: row.difficulty,
    baseXp: row.baseXp,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  });
}

export function createPostgresRewardBasisStore(pool: Pool): RewardBasisStore {
  return Object.freeze({
    async find(accountId, occurrenceId) {
      const row = await createRewardBasisStore(pool, accountId).findBasisByOccurrenceId(occurrenceId);
      return row === null ? null : mapDatabaseBasis(row);
    },

    async upsert(accountId, occurrenceId, basis) {
      const row = await runRewardBasisTransaction(pool, accountId, (store) =>
        store.upsertBasis(occurrenceId, basis),
      );
      return mapDatabaseBasis(row);
    },

    async revoke(accountId, occurrenceId, revokedAt) {
      const row = await runRewardBasisTransaction(pool, accountId, (store) =>
        store.revokeBasis(occurrenceId, new Date(revokedAt)),
      );
      return mapDatabaseBasis(row);
    },
  });
}

export function createRewardLockingService(input: {
  readonly classifier: Pick<DifficultyClassificationService, 'classifyBeforeStartSave'>;
  readonly store: RewardBasisStore;
}): RewardLockingService {
  return Object.freeze({
    async save(saveInput) {
      const currentBasis = await input.store.find(saveInput.accountId, saveInput.occurrenceId);
      const decision = resolveRewardBasisAfterSave({
        currentRewardEligibility: saveInput.currentRewardEligibility,
        currentBasis,
        scheduledStartInstant: saveInput.scheduledStartInstant,
        targetStartInstant: saveInput.targetStartInstant,
        savedAtInstant: saveInput.savedAtInstant,
        changedFields: saveInput.changedFields,
      });

      if (decision.action === 'revoke') {
        const basis = await input.store.revoke(
          saveInput.accountId,
          saveInput.occurrenceId,
          saveInput.savedAtInstant,
        );
        return { action: 'revoke' as const, basis };
      }

      if (decision.action !== 'recalculate') {
        return { action: decision.action, basis: currentBasis };
      }

      const classification = await input.classifier.classifyBeforeStartSave({
        scheduledStartInstant: saveInput.scheduledStartInstant,
        savedAtInstant: saveInput.savedAtInstant,
        changedFields: saveInput.changedFields,
        task: saveInput.task,
      });
      if (!classification.recalculated) {
        return { action: 'unchanged' as const, basis: currentBasis };
      }

      const difficulty = classification.result.difficulty;
      const basis = await input.store.upsert(saveInput.accountId, saveInput.occurrenceId, {
        difficulty,
        baseXp: calculateBaseXp(saveInput.task.estimatedDurationMinutes, difficulty),
      });
      return { action: 'recalculate' as const, basis };
    },
  });
}
