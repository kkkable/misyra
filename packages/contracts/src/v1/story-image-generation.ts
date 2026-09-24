import { z } from 'zod';

import { storyStyleProfileSchema } from './story-style-profile.js';
import { uuidSchema } from './shared.js';

const storageKeySchema = z.string().trim().min(1);

export const storyImageGenerationRequestSchema = z
  .object({
    sourceVersionId: uuidSchema,
  })
  .strict();

export const storyImageGenerationGatewayRequestSchema = z
  .object({
    source: z
      .object({
        imageVersionId: uuidSchema,
        storageKey: storageKeySchema,
      })
      .strict(),
    styleProfile: storyStyleProfileSchema.nullable(),
    output: z
      .object({
        width: z.literal(1080),
        height: z.literal(1920),
        staticImage: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const storyImageGenerationAiOutputSchema = z
  .object({
    storageKey: storageKeySchema,
  })
  .strict();

export const storyImageGenerationVersionSchema = z
  .object({
    id: uuidSchema,
    kind: z.literal('generated'),
    storageKey: storageKeySchema,
  })
  .strict();

export const storyImageGenerationResultSchema = z
  .object({
    version: storyImageGenerationVersionSchema,
    remainingGenerations: z.number().int().min(0).max(2),
  })
  .strict();

export const storyImageGenerationBudgetSchema = z
  .object({
    remainingGenerations: z.number().int().min(0).max(3),
  })
  .strict();

export type StoryImageGenerationRequest = z.infer<typeof storyImageGenerationRequestSchema>;
export type StoryImageGenerationGatewayRequest = z.infer<
  typeof storyImageGenerationGatewayRequestSchema
>;
export type StoryImageGenerationAiOutput = z.infer<typeof storyImageGenerationAiOutputSchema>;
export type StoryImageGenerationResult = z.infer<typeof storyImageGenerationResultSchema>;
export type StoryImageGenerationBudget = z.infer<typeof storyImageGenerationBudgetSchema>;
