import { z } from 'zod';

import { uuidSchema } from './shared.js';

const referenceImageSchema = z
  .object({
    assetId: uuidSchema,
    purpose: z.literal('style-references'),
    variant: z.literal('original'),
  })
  .strict();

export const storyStyleProfileRebuildRequestSchema = z
  .object({
    referenceAssetIds: z.array(uuidSchema),
  })
  .strict();

export const storyStyleProfileAiOutputSchema = z.record(z.string(), z.unknown());

export const storyStyleProfileGatewayRequestSchema = z
  .object({
    referenceImages: z.array(referenceImageSchema),
    policy: z
      .object({
        abstractOnly: z.boolean(),
        prohibitedExactContent: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export type StoryStyleProfileRebuildRequest = z.infer<typeof storyStyleProfileRebuildRequestSchema>;
export type StoryStyleProfileAiOutput = z.infer<typeof storyStyleProfileAiOutputSchema>;
export type StoryStyleProfileGatewayRequest = z.infer<typeof storyStyleProfileGatewayRequestSchema>;
