import {
  storyTextSuggestionsResultSchema,
  type StoryTextSuggestionsResult,
} from '@misyra/contracts';

type StoryTextSuggestionsApiOptions = Readonly<{
  baseUrl: string;
  accessToken: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function payloadFromEnvelope(value: unknown): unknown {
  if (!isRecord(value) || value.ok !== true || !Object.hasOwn(value, 'payload')) {
    throw new Error('story_text_suggestions_request_failed');
  }
  return value.payload;
}

export function createStoryTextSuggestionsApi({
  baseUrl,
  accessToken,
}: StoryTextSuggestionsApiOptions) {
  const root = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  return Object.freeze({
    async suggest(occurrenceId: string): Promise<StoryTextSuggestionsResult> {
      const response = await fetch(
        `${root}/v1/stories/${encodeURIComponent(occurrenceId)}/text-suggestions`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${accessToken}` },
        },
      );
      const responseBody: unknown = await response.json();
      if (!response.ok) throw new Error('story_text_suggestions_request_failed');
      return storyTextSuggestionsResultSchema.parse(payloadFromEnvelope(responseBody));
    },
  });
}

export type StoryTextSuggestionsApi = ReturnType<typeof createStoryTextSuggestionsApi>;
