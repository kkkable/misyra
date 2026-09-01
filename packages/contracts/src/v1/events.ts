import { z } from 'zod';

import { contractVersionSchema, instantSchema, uuidSchema } from './shared.js';

const eventPayloadSchema = z.record(z.unknown());

export const commandEnvelopeSchema = z
  .object({
    version: contractVersionSchema,
    commandId: uuidSchema,
    accountId: uuidSchema,
    commandType: z.string().min(1),
    occurredAt: instantSchema,
    payload: eventPayloadSchema,
  })
  .strict();

export const outboxEventEnvelopeSchema = z
  .object({
    version: contractVersionSchema,
    eventId: uuidSchema,
    accountId: uuidSchema,
    eventType: z.string().min(1),
    occurredAt: instantSchema,
    payload: eventPayloadSchema,
  })
  .strict();

export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;
export type OutboxEventEnvelope = z.infer<typeof outboxEventEnvelopeSchema>;
