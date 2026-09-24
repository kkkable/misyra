import { z } from 'zod';

import { uuidSchema } from './shared.js';

const referenceImageSchema = z
  .object({
    assetId: uuidSchema,
    purpose: z.literal('style-references'),
    variant: z.literal('original'),
  })
  .strict();

const uniqueReferenceIdsSchema = z
  .array(uuidSchema)
  .min(3)
  .max(8)
  .refine((ids) => new Set(ids).size === ids.length, 'Story style reference ids must be unique');

const uniqueReferenceImagesSchema = z
  .array(referenceImageSchema)
  .min(3)
  .max(8)
  .refine(
    (images) => new Set(images.map((image) => image.assetId)).size === images.length,
    'Story style reference images must be unique',
  );

const effectSchema = z.enum([
  'none',
  'grain',
  'vignette',
  'blur',
  'glow',
  'shadow',
  'outline',
  'duotone',
]);

export const storyStyleProfileSchema = z
  .object({
    palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).min(1).max(8),
    contrast: z.enum(['low', 'medium', 'high']),
    crop: z.enum(['tight', 'balanced', 'wide']),
    textPosition: z.enum([
      'upper_left',
      'upper_middle',
      'upper_right',
      'center_left',
      'center',
      'center_right',
      'lower_left',
      'lower_middle',
      'lower_right',
    ]),
    fontCategory: z.enum(['sans', 'serif', 'display', 'monospace', 'handwritten']),
    textDensity: z.enum(['sparse', 'balanced', 'dense']),
    emoji: z.enum(['none', 'sparse', 'balanced', 'frequent']),
    effects: z
      .array(effectSchema)
      .max(6)
      .refine((effects) => new Set(effects).size === effects.length, 'Effects must be unique'),
    tone: z.enum(['calm', 'energetic', 'playful', 'minimal', 'editorial', 'warm', 'bold', 'soft']),
  })
  .strict();

export const storyStyleProfileRebuildRequestSchema = z
  .object({
    referenceAssetIds: uniqueReferenceIdsSchema,
  })
  .strict();

export const storyStyleProfileAiOutputSchema = storyStyleProfileSchema;

const prohibitedExactContentSchema = z.enum([
  'templates',
  'usernames',
  'logos',
  'watermarks',
  'faces',
  'captions',
]);

export const storyStyleProfileGatewayRequestSchema = z
  .object({
    referenceImages: uniqueReferenceImagesSchema,
    policy: z
      .object({
        abstractOnly: z.literal(true),
        prohibitedExactContent: z
          .array(prohibitedExactContentSchema)
          .length(6)
          .refine(
            (values) => new Set(values).size === values.length,
            'All prohibited exact-content categories must be unique',
          ),
      })
      .strict(),
  })
  .strict();

export const storyStyleProfileStatusSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('unset') }).strict(),
  z.object({ mode: z.literal('default') }).strict(),
  z.object({ mode: z.literal('custom'), profile: storyStyleProfileSchema }).strict(),
]);

export type StoryStyleProfile = z.infer<typeof storyStyleProfileSchema>;
export type StoryStyleProfileRebuildRequest = z.infer<typeof storyStyleProfileRebuildRequestSchema>;
export type StoryStyleProfileAiOutput = z.infer<typeof storyStyleProfileAiOutputSchema>;
export type StoryStyleProfileGatewayRequest = z.infer<typeof storyStyleProfileGatewayRequestSchema>;
export type StoryStyleProfileStatus = z.infer<typeof storyStyleProfileStatusSchema>;
