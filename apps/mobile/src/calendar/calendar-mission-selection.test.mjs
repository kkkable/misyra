import { describe, expect, it } from 'vitest';

import { resolveMissionTap } from './calendar-mission-selection.js';

describe('MTS-044/MTS-047 mission selection contract', () => {
  it('selects on first tap and opens only on the second tap of the same mission', () => {
    expect(resolveMissionTap(null, 'mission-a')).toEqual({
      selectedMissionId: 'mission-a',
      openDetails: false,
    });
    expect(resolveMissionTap('mission-a', 'mission-a')).toEqual({
      selectedMissionId: 'mission-a',
      openDetails: true,
    });
  });

  it('moves selection to another mission without opening it', () => {
    expect(resolveMissionTap('mission-a', 'mission-b')).toEqual({
      selectedMissionId: 'mission-b',
      openDetails: false,
    });
  });
});
