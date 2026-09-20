import type { AuthoritativeCompletionTypeContract } from '@misyra/contracts';
import type { CompletionState, EvidenceState } from '@misyra/domain';

import type { MissionCardStatus } from './calendar-mission-layout.js';

export type CalendarCompletionStyleInput = Readonly<{
  completionState: CompletionState;
  evidenceState: EvidenceState;
  completionType: AuthoritativeCompletionTypeContract | null;
}>;

export function resolveMissionCardStatus(
  _input: CalendarCompletionStyleInput,
): MissionCardStatus {
  throw new Error('MTS-082 calendar completion style not implemented');
}
