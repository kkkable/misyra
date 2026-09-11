import { z } from 'zod';

import { instantSchema, uuidSchema } from './shared.js';

export const completeMissionModeSchema = z.enum([
  'verified',
  'self_confirmed',
  'private',
  'trust',
]);

export const completeMissionCommandSchema = z
  .object({
    occurrenceId: uuidSchema,
    completionMode: completeMissionModeSchema,
    effectiveActionAt: instantSchema,
    evidenceAttemptId: uuidSchema.optional(),
    deviceId: uuidSchema,
    idempotencyKey: z.string().trim().min(1),
  })
  .strict();

export const authoritativeCompletionTypeSchema = z.enum([
  'verified_on_time',
  'verified_late',
  'self_confirmed',
  'private',
  'trust_mode',
]);

export const completeMissionResultSchema = z
  .object({
    status: z.enum(['completed', 'already_completed']),
    occurrenceId: uuidSchema,
    completionId: uuidSchema,
    completionType: authoritativeCompletionTypeSchema,
    actionTime: instantSchema,
    reward: z
      .object({
        baseXp: z.number().int().nonnegative(),
        proofBonusXp: z.number().int().nonnegative(),
        awardedXp: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type CompleteMissionMode = z.infer<typeof completeMissionModeSchema>;
export type CompleteMissionCommand = z.infer<typeof completeMissionCommandSchema>;
export type AuthoritativeCompletionTypeContract = z.infer<
  typeof authoritativeCompletionTypeSchema
>;
export type CompleteMissionResult = z.infer<typeof completeMissionResultSchema>;
