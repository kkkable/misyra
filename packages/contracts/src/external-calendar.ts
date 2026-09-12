import { z } from 'zod';

import { instantSchema, uuidSchema } from './v1/shared.js';

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const positiveIntegerSchema = z.number().int().positive();
const weekdaySchema = z.number().int().min(0).max(6);
const ordinalSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(-1),
]);

export const externalCalendarProviderSchema = z.enum(['apple', 'google']);
export const externalCalendarOwnershipSchema = z.enum(['app_owned', 'organizer_controlled']);
export const externalCalendarConnectionStateSchema = z.enum([
  'connected',
  'permission_revoked',
  'provider_unavailable',
  'disconnected',
]);
export const externalCalendarErrorCodeSchema = z.enum([
  'authentication_required',
  'permission_denied',
  'rate_limited',
  'provider_unavailable',
  'invalid_sync_cursor',
  'not_found',
  'conflict',
  'unsupported',
  'unknown',
]);
export const externalCalendarRecurrenceScopeSchema = z.enum([
  'this_occurrence',
  'this_and_future',
  'entire_series',
]);

export const externalCalendarOwnershipMatrix = Object.freeze({
  app_owned: Object.freeze({
    canEditTitle: true,
    canEditSchedule: true,
    canEditRecurrence: true,
    canEditLocation: true,
    canEditProviderNotes: true,
    deleteBehavior: 'delete_provider_event' as const,
  }),
  organizer_controlled: Object.freeze({
    canEditTitle: false,
    canEditSchedule: false,
    canEditRecurrence: false,
    canEditLocation: false,
    canEditProviderNotes: false,
    deleteBehavior: 'dismiss_import' as const,
  }),
});

const recurrenceEndSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('never') }).strict(),
  z.object({ type: z.literal('date'), inclusiveLocalDate: localDateSchema }).strict(),
  z.object({ type: z.literal('count'), occurrenceCount: positiveIntegerSchema }).strict(),
]);

const recurrencePatternSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily'), interval: positiveIntegerSchema }).strict(),
  z
    .object({
      type: z.literal('weekly'),
      interval: positiveIntegerSchema,
      weekdays: z
        .array(weekdaySchema)
        .min(1)
        .refine((weekdays) => new Set(weekdays).size === weekdays.length, {
          message: 'Weekly recurrence weekdays must be unique',
        }),
      weekStartsOn: weekdaySchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('monthly-date'),
      interval: positiveIntegerSchema,
      dayOfMonth: z.number().int().min(1).max(31),
    })
    .strict(),
  z
    .object({
      type: z.literal('monthly-ordinal'),
      interval: positiveIntegerSchema,
      ordinal: ordinalSchema,
      weekday: weekdaySchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('yearly-date'),
      interval: positiveIntegerSchema,
      month: z.number().int().min(1).max(12),
      day: z.number().int().min(1).max(31),
    })
    .strict(),
  z
    .object({
      type: z.literal('yearly-ordinal'),
      interval: positiveIntegerSchema,
      month: z.number().int().min(1).max(12),
      ordinal: ordinalSchema,
      weekday: weekdaySchema,
    })
    .strict(),
]);

export const normalizedCalendarRecurrenceSchema = z
  .object({
    pattern: recurrencePatternSchema,
    end: recurrenceEndSchema,
  })
  .strict();

const timedProviderScheduleSchema = z
  .object({
    type: z.literal('timed'),
    startInstant: instantSchema,
    finishInstant: instantSchema,
    timeZone: z.string().min(1),
    timeBehavior: z.enum(['local_time', 'fixed_instant']),
  })
  .strict();

const allDayProviderScheduleSchema = z
  .object({
    type: z.literal('all_day'),
    startLocalDate: localDateSchema,
    endLocalDateExclusive: localDateSchema,
    timeZone: z.string().min(1),
  })
  .strict();

export const normalizedProviderScheduleSchema = z.discriminatedUnion('type', [
  timedProviderScheduleSchema,
  allDayProviderScheduleSchema,
]);

export const normalizedProviderEventSchema = z
  .object({
    providerCalendarId: z.string().min(1),
    providerEventId: z.string().min(1),
    title: z.string().nullable(),
    schedule: normalizedProviderScheduleSchema,
    recurrence: normalizedCalendarRecurrenceSchema.nullable(),
    location: z.string().nullable(),
    providerNotes: z.string().nullable(),
    status: z.enum(['confirmed', 'cancelled']),
    ownership: externalCalendarOwnershipSchema,
  })
  .strict();

const providerWritableEventSchema = z
  .object({
    title: z.string(),
    schedule: normalizedProviderScheduleSchema,
    recurrence: normalizedCalendarRecurrenceSchema.nullable(),
    location: z.string().nullable(),
    providerNotes: z.string().nullable(),
  })
  .strict();

const providerWritableEventPatchSchema = providerWritableEventSchema
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Calendar update command must contain at least one provider-owned field',
  });

const createCalendarCommandSchema = z
  .object({
    commandId: uuidSchema,
    connectionId: uuidSchema,
    operation: z.literal('create'),
    event: providerWritableEventSchema,
  })
  .strict();

const updateCalendarCommandSchema = z
  .object({
    commandId: uuidSchema,
    connectionId: uuidSchema,
    operation: z.literal('update'),
    providerEventId: z.string().min(1),
    recurrenceScope: externalCalendarRecurrenceScopeSchema,
    patch: providerWritableEventPatchSchema,
  })
  .strict();

const deleteCalendarCommandSchema = z
  .object({
    commandId: uuidSchema,
    connectionId: uuidSchema,
    operation: z.literal('delete'),
    providerEventId: z.string().min(1),
    recurrenceScope: externalCalendarRecurrenceScopeSchema,
  })
  .strict();

export const calendarCommandSchema = z.discriminatedUnion('operation', [
  createCalendarCommandSchema,
  updateCalendarCommandSchema,
  deleteCalendarCommandSchema,
]);

export const calendarConnectionSchema = z
  .object({
    id: uuidSchema,
    provider: externalCalendarProviderSchema,
    providerCalendarId: z.string().min(1),
    state: externalCalendarConnectionStateSchema,
  })
  .strict();

export const connectCalendarInputSchema = z
  .object({
    provider: externalCalendarProviderSchema,
    providerCalendarId: z.string().min(1),
  })
  .strict();

export const restoreHiddenEventInputSchema = z
  .object({
    connectionId: uuidSchema,
    providerEventId: z.string().min(1),
    recurrenceScope: externalCalendarRecurrenceScopeSchema,
  })
  .strict();

export const importBatchSchema = z
  .object({
    events: z.array(normalizedProviderEventSchema),
    cursor: z.string().nullable(),
  })
  .strict();

const providerUpsertChangeSchema = z
  .object({
    type: z.literal('upsert'),
    event: normalizedProviderEventSchema,
  })
  .strict();

const providerDeleteChangeSchema = z
  .object({
    type: z.literal('delete'),
    providerEventId: z.string().min(1),
    recurrenceScope: externalCalendarRecurrenceScopeSchema,
  })
  .strict();

export const providerChangeSchema = z.discriminatedUnion('type', [
  providerUpsertChangeSchema,
  providerDeleteChangeSchema,
]);

export const providerChangeBatchSchema = z
  .object({
    changes: z.array(providerChangeSchema),
    cursor: z.string().nullable(),
  })
  .strict();

const appliedCalendarCommandResultSchema = z
  .object({
    commandId: uuidSchema,
    status: z.literal('applied'),
    providerEventId: z.string().min(1),
  })
  .strict();

const failedCalendarCommandResultSchema = z
  .object({
    commandId: uuidSchema,
    status: z.literal('failed'),
    errorCode: externalCalendarErrorCodeSchema,
  })
  .strict();

export const calendarCommandResultSchema = z.discriminatedUnion('status', [
  appliedCalendarCommandResultSchema,
  failedCalendarCommandResultSchema,
]);

export type ExternalCalendarProvider = z.infer<typeof externalCalendarProviderSchema>;
export type ExternalCalendarConnectionState = z.infer<
  typeof externalCalendarConnectionStateSchema
>;
export type ExternalCalendarErrorCode = z.infer<typeof externalCalendarErrorCodeSchema>;
export type ExternalCalendarRecurrenceScope = z.infer<
  typeof externalCalendarRecurrenceScopeSchema
>;
export type NormalizedCalendarRecurrence = z.infer<typeof normalizedCalendarRecurrenceSchema>;
export type NormalizedProviderSchedule = z.infer<typeof normalizedProviderScheduleSchema>;
export type NormalizedProviderEvent = z.infer<typeof normalizedProviderEventSchema>;
export type CalendarCommand = z.infer<typeof calendarCommandSchema>;
export type CalendarConnection = z.infer<typeof calendarConnectionSchema>;
export type ConnectCalendarInput = z.infer<typeof connectCalendarInputSchema>;
export type RestoreHiddenEventInput = z.infer<typeof restoreHiddenEventInputSchema>;
export type ImportBatch = z.infer<typeof importBatchSchema>;
export type ProviderChangeBatch = z.infer<typeof providerChangeBatchSchema>;
export type CalendarCommandResult = z.infer<typeof calendarCommandResultSchema>;
export type ImportedEvent = NormalizedProviderEvent;

export class ExternalCalendarAdapterError extends Error {
  readonly code: ExternalCalendarErrorCode;

  constructor(code: ExternalCalendarErrorCode, message: string) {
    super(message);
    this.name = 'ExternalCalendarAdapterError';
    this.code = code;
  }
}

export interface ExternalCalendarAdapter {
  connect(input: ConnectCalendarInput): Promise<CalendarConnection>;
  initialImport(connectionId: string): Promise<ImportBatch>;
  pullChanges(connectionId: string): Promise<ProviderChangeBatch>;
  applyCommands(commands: CalendarCommand[]): Promise<CalendarCommandResult[]>;
  restoreHiddenEvent(input: RestoreHiddenEventInput): Promise<ImportedEvent>;
  disconnect(connectionId: string): Promise<void>;
}
