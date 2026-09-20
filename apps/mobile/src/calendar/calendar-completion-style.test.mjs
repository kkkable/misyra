import { describe, expect, it } from 'vitest';

import { resolveMissionCardStatus } from './calendar-completion-style.js';

describe('MTS-082 Calendar completion colour rules', () => {
  it.each([
    ['unfinished', 'incomplete', 'not_submitted', null, 'unfinished'],
    ['verified on time', 'completed', 'accepted', 'verified_on_time', 'verified'],
    ['verified late retry', 'completed', 'accepted', 'verified_late', 'late'],
    ['self-confirmed', 'completed', 'rejected', 'self_confirmed', 'late'],
    ['Private', 'completed', 'not_required', 'private', 'private'],
    ['Trust Mode', 'completed', 'not_required', 'trust_mode', 'private'],
  ])('%s', (_label, completionState, evidenceState, completionType, expected) => {
    expect(
      resolveMissionCardStatus({
        completionState,
        evidenceState,
        completionType,
      }),
    ).toBe(expected);
  });

  it('keeps a late verified retry yellow while retaining its proof-bonus completion type', () => {
    expect(
      resolveMissionCardStatus({
        completionState: 'completed',
        evidenceState: 'accepted',
        completionType: 'verified_late',
      }),
    ).toBe('late');
  });
});
