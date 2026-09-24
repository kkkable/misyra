import {
  storyImageGenerationRequestSchema,
  uuidSchema,
  type StoryImageGenerationBudget,
  type StoryImageGenerationRequest,
  type StoryImageGenerationResult,
} from '@misyra/contracts';

import { ApiError, type ApiRouteDefinition } from './index.js';
import {
  StoryImageGenerationBudgetExceededError,
  StoryImageGenerationContextError,
  StoryImageGenerationInvalidOutputError,
  StoryImageGenerationSourceVersionError,
  StoryImageGenerationUnavailableError,
} from './story-image-generation.js';

export type StoryImageGenerationRouteService = Readonly<{
  getBudget(accountId: string, draftId: string): Promise<StoryImageGenerationBudget>;
  getVersionMedia?(accountId: string, draftId: string, versionId: string): Promise<Buffer>;
  deleteVersion?(
    accountId: string,
    draftId: string,
    versionId: string,
  ): Promise<Readonly<{ versionId: string; deleted: true }>>;
  generate(
    accountId: string,
    request: Readonly<{ draftId: string } & StoryImageGenerationRequest>,
  ): Promise<StoryImageGenerationResult>;
}>;

function idFrom(params: unknown, key: 'draftId' | 'versionId'): string {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    throw new ApiError('validation_failed');
  }
  const parsed = uuidSchema.safeParse((params as Record<string, unknown>)[key]);
  if (!parsed.success) throw new ApiError('validation_failed');
  return parsed.data;
}

function draftIdFrom(params: unknown): string {
  return idFrom(params, 'draftId');
}

function versionIdFrom(params: unknown): string {
  return idFrom(params, 'versionId');
}

function mapServiceError(error: unknown): never {
  if (error instanceof StoryImageGenerationContextError) throw new ApiError('not_found');
  if (
    error instanceof StoryImageGenerationBudgetExceededError ||
    error instanceof StoryImageGenerationSourceVersionError
  ) {
    throw new ApiError('conflict');
  }
  if (
    error instanceof StoryImageGenerationInvalidOutputError ||
    error instanceof StoryImageGenerationUnavailableError
  ) {
    throw new ApiError('temporarily_unavailable');
  }
  throw error;
}

export function createStoryImageGenerationRoutes(
  service: StoryImageGenerationRouteService,
): ApiRouteDefinition[] {
  return [
    {
      method: 'GET',
      path: '/stories/:draftId/image-generation-budget',
      handler: async (request, _reply, auth) => {
        try {
          return await service.getBudget(auth.accountId, draftIdFrom(request.params));
        } catch (error) {
          return mapServiceError(error);
        }
      },
    },
    {
      method: 'GET',
      path: '/stories/:draftId/image-versions/:versionId/media',
      handler: async (request, reply, auth) => {
        if (service.getVersionMedia === undefined) throw new ApiError('temporarily_unavailable');
        try {
          const body = await service.getVersionMedia(
            auth.accountId,
            draftIdFrom(request.params),
            versionIdFrom(request.params),
          );
          return await reply.type('image/png').send(body);
        } catch (error) {
          return mapServiceError(error);
        }
      },
    },
    {
      method: 'DELETE',
      path: '/stories/:draftId/image-versions/:versionId',
      handler: async (request, _reply, auth) => {
        if (service.deleteVersion === undefined) throw new ApiError('temporarily_unavailable');
        try {
          return await service.deleteVersion(
            auth.accountId,
            draftIdFrom(request.params),
            versionIdFrom(request.params),
          );
        } catch (error) {
          return mapServiceError(error);
        }
      },
    },
    {
      method: 'POST',
      path: '/stories/:draftId/image-generations',
      handler: async (request, _reply, auth) => {
        const draftId = draftIdFrom(request.params);
        const parsed = storyImageGenerationRequestSchema.safeParse(request.body);
        if (!parsed.success) throw new ApiError('validation_failed');
        try {
          return await service.generate(auth.accountId, { draftId, ...parsed.data });
        } catch (error) {
          return mapServiceError(error);
        }
      },
    },
  ];
}
