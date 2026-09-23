import type { Pool } from 'pg';

type StoryStyleProfileGateway = Readonly<{
  extractStoryStyleProfile(request: unknown): Promise<unknown>;
}>;

export class StoryStyleProfileInvalidOutputError extends Error {
  constructor() {
    super('Story style-profile provider output is invalid.');
    this.name = 'StoryStyleProfileInvalidOutputError';
  }
}

export class StoryStyleProfileReferenceError extends Error {
  constructor() {
    super('Story style-profile references are unavailable.');
    this.name = 'StoryStyleProfileReferenceError';
  }
}

export function createStoryStyleProfileService(input: {
  readonly pool: Pool;
  readonly gateway?: StoryStyleProfileGateway;
  readonly now?: () => Date;
}) {
  void input;

  return Object.freeze({
    async rebuild(
      accountId: string,
      request: Readonly<{ referenceAssetIds: readonly string[] }>,
    ): Promise<never> {
      void accountId;
      void request;
      throw new Error('story_style_profile_not_implemented');
    },

    async useDefault(accountId: string): Promise<never> {
      void accountId;
      throw new Error('story_style_profile_not_implemented');
    },
  });
}
