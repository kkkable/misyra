import {
  storyImageGenerationBudgetSchema,
  storyImageGenerationResultSchema,
  type StoryImageGenerationBudget,
  type StoryImageGenerationResult,
} from '@misyra/contracts';

type StoryImageGenerationApiOptions = Readonly<{
  baseUrl: string;
  accessToken: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function payloadFromEnvelope(value: unknown): unknown {
  if (!isRecord(value) || value.ok !== true || !Object.hasOwn(value, 'payload')) {
    throw new Error('story_image_generation_request_failed');
  }
  return value.payload;
}

export function createStoryImageGenerationApi({
  baseUrl,
  accessToken,
}: StoryImageGenerationApiOptions) {
  const root = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  return Object.freeze({
    async getBudget(draftId: string): Promise<StoryImageGenerationBudget> {
      const response = await fetch(
        `${root}/v1/stories/${encodeURIComponent(draftId)}/image-generation-budget`,
        {
          method: 'GET',
          headers: { authorization: `Bearer ${accessToken}` },
        },
      );
      const responseBody: unknown = await response.json();
      if (!response.ok) throw new Error('story_image_generation_request_failed');
      return storyImageGenerationBudgetSchema.parse(payloadFromEnvelope(responseBody));
    },

    async generate(draftId: string, sourceVersionId: string): Promise<StoryImageGenerationResult> {
      const response = await fetch(
        `${root}/v1/stories/${encodeURIComponent(draftId)}/image-generations`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ sourceVersionId }),
        },
      );
      const responseBody: unknown = await response.json();
      if (!response.ok) throw new Error('story_image_generation_request_failed');
      return storyImageGenerationResultSchema.parse(payloadFromEnvelope(responseBody));
    },
  });
}

export type StoryImageGenerationApi = ReturnType<typeof createStoryImageGenerationApi>;
