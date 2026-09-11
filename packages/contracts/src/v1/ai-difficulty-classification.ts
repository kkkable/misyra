import { z } from 'zod';

import { instantSchema } from './shared.js';

export const missionDifficultySchema = z.enum(['easy', 'normal', 'hard']);

export const difficultyClassificationDimensionsSchema = z.tuple([
  z.literal('physical_effort'),
  z.literal('mental_effort'),
  z.literal('complexity'),
  z.literal('preparation'),
]);

export const difficultyClassificationTaskSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().nullable(),
    estimatedDurationMinutes: z.number().int().positive(),
  })
  .strict();

export const difficultyClassificationGatewayRequestSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().nullable(),
    estimatedDurationMinutes: z.number().int().positive(),
    classificationDimensions: difficultyClassificationDimensionsSchema,
  })
  .strict();

export const difficultyClassificationAiOutputSchema = z
  .object({
    difficulty: missionDifficultySchema,
    internalMissionType: z.string().trim().min(1),
    explanation: z.string().trim().min(1),
    confidence: z.number().min(0).max(1),
    modelVersion: z.string().trim().min(1),
  })
  .strict();

const aiDifficultyClassificationResultSchema = difficultyClassificationAiOutputSchema.extend({
  classificationSource: z.literal('ai'),
});

const fallbackDifficultyClassificationResultSchema = z
  .object({
    difficulty: z.literal('normal'),
    internalMissionType: z.null(),
    explanation: z.null(),
    confidence: z.literal(0),
    modelVersion: z.literal('fallback'),
    classificationSource: z.literal('fallback'),
  })
  .strict();

export const difficultyClassificationResultSchema = z.discriminatedUnion('classificationSource', [
  aiDifficultyClassificationResultSchema,
  fallbackDifficultyClassificationResultSchema,
]);

export const difficultyClassificationChangedFieldSchema = z.enum([
  'title',
  'description',
  'estimated_duration',
  'schedule',
]);

export const difficultyClassificationSaveRequestSchema = z
  .object({
    scheduledStartInstant: instantSchema,
    savedAtInstant: instantSchema,
    changedFields: z.array(difficultyClassificationChangedFieldSchema).min(1),
    task: difficultyClassificationTaskSchema,
  })
  .strict();

export type MissionDifficulty = z.infer<typeof missionDifficultySchema>;
export type DifficultyClassificationTask = z.infer<typeof difficultyClassificationTaskSchema>;
export type DifficultyClassificationGatewayRequest = z.infer<
  typeof difficultyClassificationGatewayRequestSchema
>;
export type DifficultyClassificationAiOutput = z.infer<
  typeof difficultyClassificationAiOutputSchema
>;
export type DifficultyClassificationResult = z.infer<typeof difficultyClassificationResultSchema>;
export type DifficultyClassificationChangedField = z.infer<
  typeof difficultyClassificationChangedFieldSchema
>;
export type DifficultyClassificationSaveRequest = z.infer<
  typeof difficultyClassificationSaveRequestSchema
>;
