import type { MutationQueueDatabase } from '../storage/mutation-queue.js';
import type { AiPlannerDraftInput } from './ai-planner-input.js';

export type AiPlannerDraftPersistenceOptions = Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  generateMutationId: () => string;
  now: () => Date;
}>;

export type PersistedAiPlannerDraft = Readonly<{
  draftId: string;
  input: AiPlannerDraftInput;
  updatedAt: string;
}>;

export function createAiPlannerDraftPersistence(_options: AiPlannerDraftPersistenceOptions) {
  return Object.freeze({
    async load(): Promise<PersistedAiPlannerDraft | null> {
      throw new Error('MTS-086 planner draft loading is not implemented.');
    },
    async save(_input: AiPlannerDraftInput): Promise<PersistedAiPlannerDraft> {
      throw new Error('MTS-086 planner draft persistence is not implemented.');
    },
  });
}
