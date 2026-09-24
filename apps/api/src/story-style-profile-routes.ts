import {
  storyStyleProfileRebuildRequestSchema,
  type StoryStyleProfileStatus,
} from '@misyra/contracts';

import { ApiError, type ApiRouteDefinition } from './index.js';
import {
  StoryStyleProfileInvalidOutputError,
  StoryStyleProfileReferenceError,
  StoryStyleProfileUnavailableError,
} from './story-style-profile.js';

export type StoryStyleProfileRouteService = Readonly<{
  getStatus(accountId: string): Promise<StoryStyleProfileStatus>;
  rebuild(accountId: string, request: unknown): Promise<StoryStyleProfileStatus>;
  useDefault(accountId: string): Promise<StoryStyleProfileStatus>;
}>;

function mapServiceError(error: unknown): never {
  if (error instanceof StoryStyleProfileReferenceError) throw new ApiError('not_found');
  if (
    error instanceof StoryStyleProfileInvalidOutputError ||
    error instanceof StoryStyleProfileUnavailableError
  ) {
    throw new ApiError('temporarily_unavailable');
  }
  throw error;
}

export function createStoryStyleProfileRoutes(
  service: StoryStyleProfileRouteService,
): ApiRouteDefinition[] {
  return [
    {
      method: 'GET',
      path: '/stories/style-profile',
      handler: async (_request, _reply, auth) => {
        try {
          return await service.getStatus(auth.accountId);
        } catch (error) {
          return mapServiceError(error);
        }
      },
    },
    {
      method: 'POST',
      path: '/stories/style-profile/rebuild',
      handler: async (request, _reply, auth) => {
        const parsed = storyStyleProfileRebuildRequestSchema.safeParse(request.body);
        if (!parsed.success) throw new ApiError('validation_failed');
        try {
          return await service.rebuild(auth.accountId, parsed.data);
        } catch (error) {
          return mapServiceError(error);
        }
      },
    },
    {
      method: 'POST',
      path: '/stories/style-profile/default',
      handler: async (_request, _reply, auth) => {
        try {
          return await service.useDefault(auth.accountId);
        } catch (error) {
          return mapServiceError(error);
        }
      },
    },
  ];
}
