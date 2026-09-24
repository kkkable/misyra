import type { Pool } from 'pg';

export interface StoryImageGenerationGateway {
  generateStoryImage(request: unknown): Promise<unknown>;
}

export class StoryImageGenerationBudgetExceededError extends Error {
  constructor() {
    super('Story AI generation budget is exhausted.');
    this.name = 'StoryImageGenerationBudgetExceededError';
  }
}

export type StoryImageGenerationResult = Readonly<{
  version: Readonly<{
    id: string;
    kind: 'generated';
    storageKey: string;
  }>;
  remainingGenerations: number;
}>;

export function createStoryImageGenerationService(input: {
  readonly pool: Pool;
  readonly gateway: StoryImageGenerationGateway;
}) {
  void input;

  return Object.freeze({
    async generate(
      accountId: string,
      request: Readonly<{ draftId: string; sourceVersionId: string }>,
    ): Promise<StoryImageGenerationResult> {
      void accountId;
      void request;
      await Promise.resolve();
      throw new Error('MTS-094 Story image generation is not implemented.');
    },
  });
}

export type StoryImageGenerationService = ReturnType<typeof createStoryImageGenerationService>;
