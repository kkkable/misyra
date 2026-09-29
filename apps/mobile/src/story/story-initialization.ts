import type {
  StoryImageGenerationBudget,
  StoryImageGenerationResult,
} from '@misyra/contracts';

import type { StorySourceImage } from './story-editor-state.js';

export type SourceFreeStoryInitializationInput<Payload> = Readonly<{
  payload: Payload;
  save: (payload: Payload) => Promise<void>;
  synchronize: () => Promise<unknown>;
  getBudget: () => Promise<StoryImageGenerationBudget>;
  generate: () => Promise<StoryImageGenerationResult>;
  appendGeneratedVersion: (
    payload: Payload,
    version: StoryImageGenerationResult['version'],
  ) => Payload;
  materialize: (
    draftId: string,
    imageVersionId: string,
  ) => Promise<StorySourceImage>;
}>;

export type SourceFreeStoryInitializationResult<Payload> = Readonly<{
  payload: Payload;
  sourceImage: StorySourceImage;
  imageVersionId: string;
  remainingGenerations: number;
}>;

export class StoryGenerationBudgetExhaustedError extends Error {
  constructor() {
    super('story_generation_budget_exhausted');
    this.name = 'StoryGenerationBudgetExhaustedError';
  }
}

export class StoryInitialImageUnavailableError extends Error {
  constructor() {
    super('story_initial_image_unavailable');
    this.name = 'StoryInitialImageUnavailableError';
  }
}

export async function initializeSourceFreeStory<Payload extends { draftId: string }>(
  input: SourceFreeStoryInitializationInput<Payload>,
): Promise<SourceFreeStoryInitializationResult<Payload>> {
  try {
    await input.save(input.payload);
    await input.synchronize();
    const budget = await input.getBudget();
    if (budget.remainingGenerations === 0) {
      throw new StoryGenerationBudgetExhaustedError();
    }

    const generated = await input.generate();
    const payload = input.appendGeneratedVersion(input.payload, generated.version);
    const sourceImage = await input.materialize(payload.draftId, generated.version.id);
    await input.save(payload);

    return {
      payload,
      sourceImage,
      imageVersionId: generated.version.id,
      remainingGenerations: generated.remainingGenerations,
    };
  } catch (error) {
    if (error instanceof StoryGenerationBudgetExhaustedError) throw error;
    throw new StoryInitialImageUnavailableError();
  }
}
