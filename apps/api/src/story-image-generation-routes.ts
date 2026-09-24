import type {
  StoryImageGenerationBudget,
  StoryImageGenerationRequest,
  StoryImageGenerationResult,
} from '@misyra/contracts';

import type { ApiRouteDefinition } from './index.js';

export type StoryImageGenerationRouteService = Readonly<{
  getBudget(accountId: string, draftId: string): Promise<StoryImageGenerationBudget>;
  generate(
    accountId: string,
    request: Readonly<{ draftId: string } & StoryImageGenerationRequest>,
  ): Promise<StoryImageGenerationResult>;
}>;

export function createStoryImageGenerationRoutes(
  service: StoryImageGenerationRouteService,
): ApiRouteDefinition[] {
  void service;
  return [];
}
