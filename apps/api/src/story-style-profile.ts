import {
  storyStyleProfileAiOutputSchema,
  storyStyleProfileGatewayRequestSchema,
  storyStyleProfileRebuildRequestSchema,
  storyStyleProfileStatusSchema,
  type StoryStyleProfileStatus,
} from '@misyra/contracts';
import type { Pool } from 'pg';

import type { AiGateway } from './ai-gateway.js';

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

export class StoryStyleProfileUnavailableError extends Error {
  constructor() {
    super('Story style-profile extraction is unavailable.');
    this.name = 'StoryStyleProfileUnavailableError';
  }
}

function isDefaultProfile(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

export function createStoryStyleProfileService(input: {
  readonly pool: Pool;
  readonly gateway?: Pick<AiGateway, 'extractStoryStyleProfile'>;
  readonly now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());

  const persistProfile = async (accountId: string, profile: unknown): Promise<void> => {
    await input.pool.query(
      `INSERT INTO story_style_profiles (account_id, profile, updated_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (account_id)
       DO UPDATE SET profile = EXCLUDED.profile, updated_at = EXCLUDED.updated_at`,
      [accountId, JSON.stringify(profile), now()],
    );
  };

  return Object.freeze({
    async getStatus(accountId: string): Promise<StoryStyleProfileStatus> {
      const result = await input.pool.query<{ profile: unknown }>(
        `SELECT profile
           FROM story_style_profiles
          WHERE account_id = $1`,
        [accountId],
      );
      const stored = result.rows[0]?.profile;
      if (stored === undefined) return { mode: 'unset' };
      if (isDefaultProfile(stored)) return { mode: 'default' };

      const parsed = storyStyleProfileAiOutputSchema.safeParse(stored);
      if (!parsed.success) throw new StoryStyleProfileInvalidOutputError();
      return storyStyleProfileStatusSchema.parse({ mode: 'custom', profile: parsed.data });
    },

    async rebuild(accountId: string, request: unknown): Promise<StoryStyleProfileStatus> {
      const validated = storyStyleProfileRebuildRequestSchema.parse(request);
      const references = await input.pool.query<{ id: string }>(
        `SELECT id
           FROM media_assets
          WHERE account_id = $1
            AND id = ANY($2::uuid[])
            AND purpose = 'style-references'
            AND deletion_state = 'active'
            AND original_storage_key IS NOT NULL`,
        [accountId, validated.referenceAssetIds],
      );
      const available = new Set(references.rows.map((row) => row.id));
      if (
        available.size !== validated.referenceAssetIds.length ||
        validated.referenceAssetIds.some((assetId) => !available.has(assetId))
      ) {
        throw new StoryStyleProfileReferenceError();
      }
      if (input.gateway === undefined) throw new StoryStyleProfileUnavailableError();

      const gatewayRequest = storyStyleProfileGatewayRequestSchema.parse({
        referenceImages: validated.referenceAssetIds.map((assetId) => ({
          assetId,
          purpose: 'style-references',
          variant: 'original',
        })),
        policy: {
          abstractOnly: true,
          prohibitedExactContent: [
            'templates',
            'usernames',
            'logos',
            'watermarks',
            'faces',
            'captions',
          ],
        },
      });
      const extracted = storyStyleProfileAiOutputSchema.safeParse(
        await input.gateway.extractStoryStyleProfile(gatewayRequest),
      );
      if (!extracted.success) throw new StoryStyleProfileInvalidOutputError();

      await persistProfile(accountId, extracted.data);
      return storyStyleProfileStatusSchema.parse({ mode: 'custom', profile: extracted.data });
    },

    async useDefault(accountId: string): Promise<StoryStyleProfileStatus> {
      await persistProfile(accountId, {});
      return { mode: 'default' };
    },
  });
}

export type StoryStyleProfileService = ReturnType<typeof createStoryStyleProfileService>;
