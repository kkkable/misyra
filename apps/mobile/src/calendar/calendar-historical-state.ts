import { evaluateCompletionEligibility, type MissionOccurrence } from '@misyra/domain';

export type CalendarHistoricalLifecycle =
  'future' | 'active' | 'completed' | 'expired' | 'cancelled';

function completionStateAt(occurrence: MissionOccurrence, now: Date) {
  return evaluateCompletionEligibility({
    schedule: occurrence.schedule,
    actionInstant: now.toISOString(),
  }).state;
}

export function historicalLifecycleForMission(
  occurrence: MissionOccurrence,
  now: Date,
): CalendarHistoricalLifecycle {
  if (occurrence.scheduleState === 'cancelled') return 'cancelled';
  if (occurrence.completionState === 'completed') return 'completed';

  const state = completionStateAt(occurrence, now);
  if (state === 'not_started') return 'future';
  if (state === 'expired') return 'expired';
  return 'active';
}

export function assertMissionCompletionWindowOpen(occurrence: MissionOccurrence, now: Date): void {
  if (completionStateAt(occurrence, now) === 'expired') {
    throw new Error('Mission completion window has expired.');
  }
}
