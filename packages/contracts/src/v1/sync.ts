import { z } from 'zod';

import {
  calendarSourceSchema,
  completionStateSchema,
  contractVersionSchema,
  deletionStateSchema,
  evidenceStateSchema,
  fieldOwnershipSchema,
  instantSchema,
  rewardEligibilitySchema,
  rewardIssuanceSchema,
  scheduleStateSchema,
  storyStateSchema,
  synchronizationStateSchema,
  timeBehaviorSchema,
  uuidSchema,
} from './shared.js';

export const mobileMissionScheduleSchema = z
  .object({
    allDay: z.boolean(),
    estimatedEffortMinutes: z.number().int().positive().nullable(),
    finishInstant: instantSchema,
    localFinish: z.string().min(1),
    localStart: z.string().min(1),
    startInstant: instantSchema,
    timeBehavior: timeBehaviorSchema,
    timeZone: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.allDay && value.estimatedEffortMinutes === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'All-day missions require estimated effort',
      });
    }
    if (!value.allDay && value.estimatedEffortMinutes !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Timed missions do not carry all-day effort',
      });
    }
  });

export const mobileMissionSchema = z
  .object({
    calendarSource: calendarSourceSchema,
    completionState: completionStateSchema,
    deletionState: deletionStateSchema,
    evidenceState: evidenceStateSchema,
    fieldOwnership: fieldOwnershipSchema,
    id: uuidSchema,
    rewardEligibility: rewardEligibilitySchema,
    rewardIssuance: rewardIssuanceSchema,
    schedule: mobileMissionScheduleSchema,
    scheduleState: scheduleStateSchema,
    seriesId: uuidSchema,
    storyState: storyStateSchema,
    synchronizationState: synchronizationStateSchema,
    title: z.string().min(1),
  })
  .strict();

export const mobileCalendarConnectionSchema = z
  .object({
    id: uuidSchema,
    provider: z.enum(['apple', 'google']),
    initialSyncDirection: z.enum(['external_to_misyra', 'misyra_to_external']),
    connected: z.boolean(),
  })
  .strict();

const missionUpsertChangeSchema = z
  .object({
    version: contractVersionSchema,
    sequence: z.number().int().nonnegative(),
    entityType: z.literal('mission'),
    entityId: uuidSchema,
    operation: z.literal('upsert'),
    payload: mobileMissionSchema,
  })
  .strict();

const missionDeleteChangeSchema = z
  .object({
    version: contractVersionSchema,
    sequence: z.number().int().nonnegative(),
    entityType: z.literal('mission'),
    entityId: uuidSchema,
    operation: z.literal('delete'),
    payload: z.null(),
  })
  .strict();

const calendarConnectionUpsertChangeSchema = z
  .object({
    version: contractVersionSchema,
    sequence: z.number().int().nonnegative(),
    entityType: z.literal('calendar_connection'),
    entityId: uuidSchema,
    operation: z.literal('upsert'),
    payload: mobileCalendarConnectionSchema,
  })
  .strict();

const calendarConnectionDeleteChangeSchema = z
  .object({
    version: contractVersionSchema,
    sequence: z.number().int().nonnegative(),
    entityType: z.literal('calendar_connection'),
    entityId: uuidSchema,
    operation: z.literal('delete'),
    payload: z.null(),
  })
  .strict();

export const syncChangeSchema = z.union([
  missionUpsertChangeSchema,
  missionDeleteChangeSchema,
  calendarConnectionUpsertChangeSchema,
  calendarConnectionDeleteChangeSchema,
]);

export const syncMutationEntityTypeSchema = z.enum([
  'mission',
  'story',
  'completion',
  'evidence',
  'settings',
]);
export const syncMutationOperationSchema = z.enum([
  'create',
  'update',
  'delete',
  'complete',
  'submit',
]);
export const syncMutationSchema = z
  .object({
    mutationId: z.string().min(1),
    accountId: z.string().min(1),
    deviceId: z.string().min(1),
    entityType: syncMutationEntityTypeSchema,
    entityId: z.string().min(1),
    operation: syncMutationOperationSchema,
    baseVersion: z.number().int().nonnegative().nullable(),
    clientOccurredAt: z.string().min(1),
    payload: z.unknown(),
  })
  .strict();

export const serverAccountChangeSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    operation: z.string().min(1),
    payload: z.unknown(),
  })
  .strict();

export const syncPushRequestSchema = z
  .object({ mutations: z.array(syncMutationSchema).max(500) })
  .strict();
export const syncPushResponseSchema = z
  .object({ acceptedMutationIds: z.array(z.string().min(1)) })
  .strict();
export const syncPullQuerySchema = z
  .object({
    cursor: z.coerce.number().int().nonnegative(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();
export const syncPullResponseSchema = z.union([
  z
    .object({
      kind: z.literal('incremental'),
      changes: z.array(serverAccountChangeSchema),
      nextCursor: z.number().int().nonnegative(),
      hasMore: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('snapshot_required'),
      reason: z.enum(['invalid_cursor', 'expired_cursor']),
      nextCursor: z.number().int().nonnegative(),
    })
    .strict(),
]);
export const syncSnapshotResponseSchema = z
  .object({
    entries: z.array(serverAccountChangeSchema),
    nextCursor: z.number().int().nonnegative(),
  })
  .strict();

export type MobileMission = z.infer<typeof mobileMissionSchema>;
export type MobileCalendarConnection = z.infer<typeof mobileCalendarConnectionSchema>;
export type SyncChange = z.infer<typeof syncChangeSchema>;
export type SyncMutationContract = z.infer<typeof syncMutationSchema>;
export type ServerAccountChangeContract = z.infer<typeof serverAccountChangeSchema>;
export type SyncPullResponseContract = z.infer<typeof syncPullResponseSchema>;
export type SyncSnapshotResponseContract = z.infer<typeof syncSnapshotResponseSchema>;
