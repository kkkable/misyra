import { randomUUID } from 'node:crypto';

import {
  storyImageGenerationAiOutputSchema,
  storyImageGenerationBudgetSchema,
  storyImageGenerationGatewayRequestSchema,
  storyImageGenerationResultSchema,
  storyStyleProfileSchema,
  type StoryImageGenerationBudget,
  type StoryImageGenerationResult,
  type StoryStyleProfile,
} from '@misyra/contracts';
import type { Pool, PoolClient } from 'pg';

import type { AiGateway } from './ai-gateway.js';
import type { ProtectedMediaBlobStore } from './protected-media.js';

const MAX_GENERATIONS = 3;

export type StoryImageGenerationGateway = Pick<AiGateway, 'generateStoryImage'>;

export class StoryImageGenerationBudgetExceededError extends Error {
  constructor() {
    super('Story AI generation budget is exhausted.');
    this.name = 'StoryImageGenerationBudgetExceededError';
  }
}

export class StoryImageGenerationContextError extends Error {
  constructor() {
    super('Story image generation context is unavailable.');
    this.name = 'StoryImageGenerationContextError';
  }
}

export class StoryImageGenerationSourceVersionError extends Error {
  constructor() {
    super('Source Story image version cannot be deleted.');
    this.name = 'StoryImageGenerationSourceVersionError';
  }
}

export class StoryImageGenerationInvalidOutputError extends Error {
  constructor() {
    super('Story image generation provider output is invalid.');
    this.name = 'StoryImageGenerationInvalidOutputError';
  }
}

export class StoryImageGenerationUnavailableError extends Error {
  constructor() {
    super('Story image generation is unavailable.');
    this.name = 'StoryImageGenerationUnavailableError';
  }
}

function customStyleProfile(value: unknown): StoryStyleProfile | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
    return null;
  }
  const parsed = storyStyleProfileSchema.safeParse(value);
  if (!parsed.success) throw new StoryImageGenerationContextError();
  return parsed.data;
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original generation failure.
  }
}

export function createStoryImageGenerationService(input: {
  readonly pool: Pool;
  readonly gateway?: StoryImageGenerationGateway;
  readonly blobStore?: Pick<ProtectedMediaBlobStore, 'delete' | 'get' | 'put'>;
  readonly now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());

  return Object.freeze({
    async getBudget(accountId: string, draftId: string): Promise<StoryImageGenerationBudget> {
      const result = await input.pool.query<{ aiGenerationCount: number }>(
        `SELECT ai_generation_count AS "aiGenerationCount"
           FROM story_drafts
          WHERE account_id = $1
            AND id = $2
            AND state = 'active'`,
        [accountId, draftId],
      );
      const row = result.rows[0];
      if (row === undefined) throw new StoryImageGenerationContextError();
      return storyImageGenerationBudgetSchema.parse({
        remainingGenerations: MAX_GENERATIONS - row.aiGenerationCount,
      });
    },

    async getVersionMedia(
      accountId: string,
      draftId: string,
      versionId: string,
    ): Promise<Buffer> {
      if (input.blobStore === undefined) throw new StoryImageGenerationUnavailableError();
      const result = await input.pool.query<{ storageKey: string }>(
        `SELECT version.storage_key AS "storageKey"
           FROM story_drafts draft
           JOIN story_image_versions version
             ON version.draft_id = draft.id
            AND version.id = $3
            AND version.kind = 'generated'
          WHERE draft.account_id = $1
            AND draft.id = $2
            AND draft.state = 'active'`,
        [accountId, draftId, versionId],
      );
      const row = result.rows[0];
      if (row === undefined) throw new StoryImageGenerationContextError();
      try {
        return await input.blobStore.get('story-working', row.storageKey);
      } catch {
        throw new StoryImageGenerationUnavailableError();
      }
    },

    async deleteVersion(
      accountId: string,
      draftId: string,
      versionId: string,
    ): Promise<Readonly<{ versionId: string; deleted: true }>> {
      if (input.blobStore === undefined) throw new StoryImageGenerationUnavailableError();

      const client = await input.pool.connect();
      let deletedBytes: Buffer | null = null;
      let storageKey: string | null = null;
      try {
        await client.query('BEGIN');
        const result = await client.query<{ kind: 'source' | 'generated'; storageKey: string }>(
          `SELECT version.kind,
                  version.storage_key AS "storageKey"
             FROM story_drafts draft
             JOIN story_image_versions version
               ON version.draft_id = draft.id
              AND version.id = $3
            WHERE draft.account_id = $1
              AND draft.id = $2
              AND draft.state = 'active'
            FOR UPDATE OF version`,
          [accountId, draftId, versionId],
        );
        const row = result.rows[0];
        if (row === undefined) throw new StoryImageGenerationContextError();
        if (row.kind === 'source') throw new StoryImageGenerationSourceVersionError();

        storageKey = row.storageKey;
        try {
          deletedBytes = await input.blobStore.get('story-working', storageKey);
          await input.blobStore.delete('story-working', storageKey);
        } catch {
          throw new StoryImageGenerationUnavailableError();
        }

        const deleted = await client.query(
          `DELETE FROM story_image_versions
            WHERE id = $1
              AND draft_id = $2
              AND kind = 'generated'`,
          [versionId, draftId],
        );
        if (deleted.rowCount !== 1) throw new StoryImageGenerationContextError();
        await client.query('COMMIT');
        return Object.freeze({ versionId, deleted: true as const });
      } catch (error) {
        await rollback(client);
        if (deletedBytes !== null && storageKey !== null) {
          try {
            await input.blobStore.put('story-working', storageKey, deletedBytes, 'image/png');
          } catch {
            // Preserve the original deletion failure.
          }
        }
        throw error;
      } finally {
        client.release();
      }
    },

    async generate(
      accountId: string,
      request: Readonly<{ draftId: string; sourceVersionId: string }>,
    ): Promise<StoryImageGenerationResult> {
      if (input.gateway === undefined) throw new StoryImageGenerationUnavailableError();

      const client = await input.pool.connect();
      try {
        await client.query('BEGIN');
        const context = await client.query<{
          aiGenerationCount: number;
          sourceStorageKey: string;
          styleProfile: unknown;
        }>(
          `SELECT d.ai_generation_count AS "aiGenerationCount",
                  source.storage_key AS "sourceStorageKey",
                  profile.profile AS "styleProfile"
             FROM story_drafts d
             JOIN story_image_versions source
               ON source.draft_id = d.id
              AND source.id = $3
              AND source.kind = 'source'
        LEFT JOIN story_style_profiles profile
               ON profile.account_id = d.account_id
            WHERE d.account_id = $1
              AND d.id = $2
              AND d.state = 'active'
            FOR UPDATE OF d`,
          [accountId, request.draftId, request.sourceVersionId],
        );
        const row = context.rows[0];
        if (row === undefined) throw new StoryImageGenerationContextError();
        if (row.aiGenerationCount >= MAX_GENERATIONS) {
          throw new StoryImageGenerationBudgetExceededError();
        }

        const nextCount = row.aiGenerationCount + 1;
        await client.query(
          `UPDATE story_drafts
              SET ai_generation_count = $3,
                  updated_at = now()
            WHERE account_id = $1
              AND id = $2`,
          [accountId, request.draftId, nextCount],
        );

        const gatewayRequest = storyImageGenerationGatewayRequestSchema.parse({
          source: {
            imageVersionId: request.sourceVersionId,
            storageKey: row.sourceStorageKey,
          },
          styleProfile: customStyleProfile(row.styleProfile),
          output: {
            width: 1080,
            height: 1920,
            staticImage: true,
          },
        });
        const generated = storyImageGenerationAiOutputSchema.safeParse(
          await input.gateway.generateStoryImage(gatewayRequest),
        );
        if (!generated.success) throw new StoryImageGenerationInvalidOutputError();

        const version = {
          id: randomUUID(),
          kind: 'generated' as const,
          storageKey: generated.data.storageKey,
        };
        await client.query(
          `INSERT INTO story_image_versions (id, draft_id, kind, storage_key)
           VALUES ($1, $2, 'generated', $3)`,
          [version.id, request.draftId, version.storageKey],
        );
        const savedAt = now().toISOString();
        await client.query(
          `INSERT INTO story_compositions
             (id, draft_id, image_version_id, composition, revision, saved_at)
           VALUES ($1, $2, $1, $3::jsonb, 0, $4)`,
          [
            version.id,
            request.draftId,
            JSON.stringify({
              canvas: { width: 1080, height: 1920 },
              background: { scale: 1, translateX: 0, translateY: 0, rotation: 0 },
              headline: null,
              supportingText: null,
              effects: [],
              revision: 0,
              savedAt,
            }),
            new Date(savedAt),
          ],
        );
        await client.query('COMMIT');

        return storyImageGenerationResultSchema.parse({
          version,
          remainingGenerations: MAX_GENERATIONS - nextCount,
        });
      } catch (error) {
        await rollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
  });
}

export type StoryImageGenerationService = ReturnType<typeof createStoryImageGenerationService>;
