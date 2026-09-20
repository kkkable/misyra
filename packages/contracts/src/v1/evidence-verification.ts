import { z } from 'zod';

import { evidenceVerificationMissionContextSchema } from '../external-calendar.js';
import { uuidSchema } from './shared.js';

export const evidenceVerificationRejectionReasonCodeSchema = z.enum([
  'image_unusable',
  'task_not_evident',
  'task_mismatch',
]);

export const evidenceVerificationReasonCodeSchema = z.union([
  z.literal('verified'),
  evidenceVerificationRejectionReasonCodeSchema,
]);

const evidenceVerificationAcceptedOutputSchema = z
  .object({
    verdict: z.literal('accepted'),
    reasonCode: z.literal('verified'),
  })
  .strict();

const evidenceVerificationRejectedOutputSchema = z
  .object({
    verdict: z.literal('rejected'),
    reasonCode: evidenceVerificationRejectionReasonCodeSchema,
  })
  .strict();

export const evidenceVerificationAiOutputSchema = z.discriminatedUnion('verdict', [
  evidenceVerificationAcceptedOutputSchema,
  evidenceVerificationRejectedOutputSchema,
]);

export const evidenceVerificationGatewayRequestSchema = z
  .object({
    missionContext: evidenceVerificationMissionContextSchema,
    submittedImage: z
      .object({
        assetId: uuidSchema,
        purpose: z.literal('evidence-working'),
        variant: z.literal('original'),
      })
      .strict(),
  })
  .strict();

export type EvidenceVerificationReasonCode = z.infer<typeof evidenceVerificationReasonCodeSchema>;
export type EvidenceVerificationAiOutput = z.infer<typeof evidenceVerificationAiOutputSchema>;
export type EvidenceVerificationGatewayRequest = z.infer<
  typeof evidenceVerificationGatewayRequestSchema
>;
