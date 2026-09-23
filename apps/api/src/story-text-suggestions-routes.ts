import { uuidSchema, type StoryTextSuggestionsResult } from '@misyra/contracts';

import { ApiError, type ApiRouteDefinition } from './index.js';
import {
  StoryTextSuggestionContextError,
  StoryTextSuggestionUnsafeClaimError,
} from './story-text-suggestions.js';

export type StoryTextSuggestionRouteService = Readonly<{
  suggest(accountId: string, occurrenceId: string): Promise<StoryTextSuggestionsResult>;
}>;

function occurrenceIdFrom(params: unknown): string {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    throw new ApiError('validation_failed');
  }
  const parsed = uuidSchema.safeParse((params as Record<string, unknown>).occurrenceId);
  if (!parsed.success) throw new ApiError('validation_failed');
  return parsed.data;
}

export function createStoryTextSuggestionRoutes(
  service?: StoryTextSuggestionRouteService,
): ApiRouteDefinition[] {
  return [
    {
      method: 'POST',
      path: '/stories/:occurrenceId/text-suggestions',
      handler: async (request, _reply, auth) => {
        const occurrenceId = occurrenceIdFrom(request.params);
        if (service === undefined) throw new ApiError('temporarily_unavailable');
        try {
          return await service.suggest(auth.accountId, occurrenceId);
        } catch (error) {
          if (error instanceof StoryTextSuggestionContextError) {
            throw new ApiError('not_found');
          }
          if (error instanceof StoryTextSuggestionUnsafeClaimError) {
            throw new ApiError('temporarily_unavailable');
          }
          throw new ApiError('temporarily_unavailable');
        }
      },
    },
  ];
}
