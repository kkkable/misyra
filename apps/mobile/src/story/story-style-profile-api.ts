import {
  storyStyleProfileStatusSchema,
  type StoryStyleProfileStatus,
} from '@misyra/contracts';

type StoryStyleProfileApiOptions = Readonly<{
  baseUrl: string;
  accessToken: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function payloadFromEnvelope(value: unknown): unknown {
  if (!isRecord(value) || value.ok !== true || !Object.hasOwn(value, 'payload')) {
    throw new Error('story_style_profile_request_failed');
  }
  return value.payload;
}

export function createStoryStyleProfileApi({ baseUrl, accessToken }: StoryStyleProfileApiOptions) {
  const root = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const authorization = `Bearer ${accessToken}`;

  return Object.freeze({
    async getStatus(): Promise<StoryStyleProfileStatus> {
      const response = await fetch(`${root}/v1/stories/style-profile`, {
        headers: { authorization },
      });
      const responseBody: unknown = await response.json();
      if (!response.ok) throw new Error('story_style_profile_request_failed');
      return storyStyleProfileStatusSchema.parse(payloadFromEnvelope(responseBody));
    },

    async rebuild(referenceAssetIds: readonly string[]): Promise<StoryStyleProfileStatus> {
      const response = await fetch(`${root}/v1/stories/style-profile/rebuild`, {
        method: 'POST',
        headers: {
          authorization,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ referenceAssetIds }),
      });
      const responseBody: unknown = await response.json();
      if (!response.ok) throw new Error('story_style_profile_request_failed');
      return storyStyleProfileStatusSchema.parse(payloadFromEnvelope(responseBody));
    },

    async useDefault(): Promise<StoryStyleProfileStatus> {
      const response = await fetch(`${root}/v1/stories/style-profile/default`, {
        method: 'POST',
        headers: { authorization },
      });
      const responseBody: unknown = await response.json();
      if (!response.ok) throw new Error('story_style_profile_request_failed');
      return storyStyleProfileStatusSchema.parse(payloadFromEnvelope(responseBody));
    },
  });
}

export type StoryStyleProfileApi = ReturnType<typeof createStoryStyleProfileApi>;
