import type { Pool } from 'pg';

export type PlannerConfirmationInput = Readonly<{
  accountId: string;
  idempotencyKey: string;
  now?: Date;
}>;

export type PlannerConfirmationResult = Readonly<{
  missionCount: number;
  calendarDate: string;
  occurrenceIds: readonly string[];
}>;

export class PlannerConfirmationInvalidDraftError extends Error {
  constructor(message = 'Planner draft cannot be activated.') {
    super(message);
    this.name = 'PlannerConfirmationInvalidDraftError';
  }
}

export function confirmPlannerDraft(
  pool: Pool,
  input: PlannerConfirmationInput,
): Promise<PlannerConfirmationResult> {
  void pool;
  void input;
  return Promise.reject(new Error('MTS-089 atomic confirmation is not implemented.'));
}
