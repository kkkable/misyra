import { z } from 'zod';

import {
  externalCalendarRecurrenceScopeSchema,
  normalizedProviderEventSchema,
} from './external-calendar.js';
import { instantSchema } from './v1/shared.js';

export const synchronizedProviderEventSchema = normalizedProviderEventSchema
  .extend({
    providerUpdatedAt: instantSchema,
  })
  .strict();

export const synchronizedImportBatchSchema = z
  .object({
    events: z.array(synchronizedProviderEventSchema),
    cursor: z.string().nullable(),
  })
  .strict();

const synchronizedProviderUpsertChangeSchema = z
  .object({
    type: z.literal('upsert'),
    event: synchronizedProviderEventSchema,
  })
  .strict();

const synchronizedProviderDeleteChangeSchema = z
  .object({
    type: z.literal('delete'),
    providerEventId: z.string().min(1),
    providerUpdatedAt: instantSchema,
    recurrenceScope: externalCalendarRecurrenceScopeSchema,
  })
  .strict();

export const synchronizedProviderChangeSchema = z.discriminatedUnion('type', [
  synchronizedProviderUpsertChangeSchema,
  synchronizedProviderDeleteChangeSchema,
]);

export const synchronizedProviderChangeBatchSchema = z
  .object({
    changes: z.array(synchronizedProviderChangeSchema),
    cursor: z.string().nullable(),
  })
  .strict();

export type SynchronizedProviderEvent = z.infer<typeof synchronizedProviderEventSchema>;
export type SynchronizedImportBatch = z.infer<typeof synchronizedImportBatchSchema>;
export type SynchronizedProviderChange = z.infer<typeof synchronizedProviderChangeSchema>;
export type SynchronizedProviderChangeBatch = z.infer<
  typeof synchronizedProviderChangeBatchSchema
>;
