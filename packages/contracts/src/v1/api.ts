import { z } from 'zod';

import { contractVersionSchema, uuidSchema } from './shared.js';

export const clientActionErrorCodes = [
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'already_completed',
  'completion_window_expired',
  'evidence_attempt_limit',
  'temporarily_unavailable',
] as const;

export const clientActionErrorCodeSchema = z.enum(clientActionErrorCodes);

export const clientActionErrorSchema = z
  .object({
    version: contractVersionSchema,
    code: clientActionErrorCodeSchema,
    retryable: z.boolean(),
    messageKey: z.string().min(1),
  })
  .strict();

export const apiRequestEnvelopeSchema = z
  .object({
    version: contractVersionSchema,
    requestId: uuidSchema,
    payload: z.unknown(),
  })
  .strict();

export const apiResponseEnvelopeSchema = z
  .object({
    version: contractVersionSchema,
    requestId: uuidSchema,
    ok: z.boolean(),
    payload: z.unknown().optional(),
    error: clientActionErrorSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.ok && value.error !== undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Successful responses cannot contain errors' });
    }
    if (!value.ok && value.error === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Failed responses require an error' });
    }
  });

export type ClientActionError = z.infer<typeof clientActionErrorSchema>;
export type ApiRequestEnvelope = z.infer<typeof apiRequestEnvelopeSchema>;
export type ApiResponseEnvelope = z.infer<typeof apiResponseEnvelopeSchema>;
