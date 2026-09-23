import type { Pool } from 'pg';

import type { AiGateway } from './ai-gateway.js';

export class StoryTextSuggestionUnsafeClaimError extends Error {
  constructor() {
    super('Story text suggestion contains an unsupported verification claim.');
    this.name = 'StoryTextSuggestionUnsafeClaimError';
  }
}

export function createStoryTextSuggestionService(_input: {
  readonly pool: Pool;
  readonly gateway: Pick<AiGateway, 'suggestStoryText'>;
}) {
  return Object.freeze({
    async suggest(_accountId: string, _occurrenceId: string): Promise<never> {
      throw new Error('story_text_suggestions_not_implemented');
    },
  });
}
