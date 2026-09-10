import { z } from 'zod';

import { instantSchema, rewardEligibilitySchema } from './shared.js';

const providerTextSchema = z.string().nullable();
const positiveEffortMinutesSchema = z.number().int().positive();

export const importedAllDayEffortEstimationRequestSchema = z
  .object({
    providerTitle: providerTextSchema,
    providerDescription: providerTextSchema,
    providerLocation: providerTextSchema,
  })
  .strict();

export const importedAllDayEffortEstimationResponseSchema = z
  .object({
    providerTitle: providerTextSchema,
    titleReadOnly: z.literal(true),
    estimatedEffortMinutes: positiveEffortMinutesSchema,
    estimationSource: z.enum(['ai', 'fallback']),
  })
  .strict();

export const importedAllDayEffortEditRequestSchema = z
  .object({
    scheduledStartInstant: instantSchema,
    savedAtInstant: instantSchema,
    currentRewardEligibility: rewardEligibilitySchema,
    currentEstimatedEffortMinutes: positiveEffortMinutesSchema,
    estimatedEffortMinutes: positiveEffortMinutesSchema,
  })
  .strict();

export const importedAllDayEffortEditResponseSchema = z
  .object({
    estimatedEffortMinutes: positiveEffortMinutesSchema,
    rewardEligibility: rewardEligibilitySchema,
  })
  .strict();

export type ImportedAllDayEffortEstimationRequest = z.infer<
  typeof importedAllDayEffortEstimationRequestSchema
>;
export type ImportedAllDayEffortEstimationResponse = z.infer<
  typeof importedAllDayEffortEstimationResponseSchema
>;
export type ImportedAllDayEffortEditRequest = z.infer<typeof importedAllDayEffortEditRequestSchema>;
export type ImportedAllDayEffortEditResponse = z.infer<
  typeof importedAllDayEffortEditResponseSchema
>;
