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

export type MobileMission = z.infer<typeof mobileMissionSchema>;
export type MobileCalendarConnection = z.infer<typeof mobileCalendarConnectionSchema>;
export type SyncChange = z.infer<typeof syncChangeSchema>;
