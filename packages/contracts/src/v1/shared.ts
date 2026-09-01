import { z } from 'zod';

export const contractVersion = 1 as const;
export const contractVersionSchema = z.literal(contractVersion);
export const uuidSchema = z.string().uuid();
export const instantSchema = z.string().datetime({ offset: true });

export const timeBehaviorSchema = z.enum(['local_time', 'fixed_instant']);
export const scheduleStateSchema = z.enum(['scheduled', 'cancelled']);
export const completionStateSchema = z.enum(['incomplete', 'completed']);
export const evidenceStateSchema = z.enum([
  'not_submitted',
  'pending',
  'accepted',
  'rejected',
  'not_required',
]);
export const rewardEligibilitySchema = z.enum(['undetermined', 'eligible', 'ineligible']);
export const rewardIssuanceSchema = z.enum(['not_issued', 'issued']);
export const calendarSourceSchema = z.enum(['internal', 'external']);
export const fieldOwnershipSchema = z.enum(['app_owned', 'organizer_controlled']);
export const synchronizationStateSchema = z.enum(['local_only', 'pending', 'synced', 'failed']);
export const storyStateSchema = z.enum(['none', 'draft', 'ready']);
export const deletionStateSchema = z.enum(['active', 'deleted']);

export type ContractVersion = z.infer<typeof contractVersionSchema>;
