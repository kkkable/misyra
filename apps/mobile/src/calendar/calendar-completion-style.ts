import type { AuthoritativeCompletionTypeContract } from '@misyra/contracts';
import type { CompletionState, EvidenceState } from '@misyra/domain';

import type { MissionCardStatus } from './calendar-mission-layout.js';

export type CalendarCompletionStyleInput = Readonly<{
  completionState: CompletionState;
  evidenceState: EvidenceState;
  completionType: AuthoritativeCompletionTypeContract | null;
}>;

export function resolveMissionCardStatus(input: CalendarCompletionStyleInput): MissionCardStatus {
  if (input.completionState === 'incomplete') return 'unfinished';

  switch (input.completionType) {
    case 'verified_on_time':
      return 'verified';
    case 'verified_late':
    case 'self_confirmed':
      return 'late';
    case 'private':
    case 'trust_mode':
      return 'private';
    case null:
      if (input.evidenceState === 'not_required') return 'private';
      if (input.evidenceState === 'accepted') return 'verified';
      return 'late';
  }
}
