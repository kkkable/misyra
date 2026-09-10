import { describe, expect, it } from 'vitest';

import { createZonedAllDaySchedule, createZonedTimedSchedule } from '@misyra/domain';

import { historicalLifecycleForMission } from './calendar-historical-state.js';

function occurrence(schedule, overrides = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    seriesId: '33333333-3333-4333-8333-333333333333',
    schedule,
    scheduleState: 'scheduled',
    completionState: 'incomplete',
    evidenceState: 'not_submitted',
    rewardEligibility: 'eligible',
    rewardIssuance: 'not_issued',
    calendarSource: 'internal',
    fieldOwnership: 'app_owned',
    synchronizationState: 'synced',
    storyState: 'none',
    deletionState: 'active',
    ...overrides,
  };
}

describe('MTS-054 historical Calendar lifecycle', () => {
  it('transitions at the exact saved-zone 30-day expiry across a DST offset change', () => {
    const schedule = createZonedTimedSchedule({
      localStart: '2026-03-08T01:00:00',
      localFinish: '2026-03-08T01:30:00',
      timeZone: 'America/New_York',
      timeBehavior: 'local_time',
    });
    const mission = occurrence(schedule);

    expect(
      historicalLifecycleForMission(mission, new Date('2026-04-07T05:29:59.999Z')),
    ).toBe('active');
    expect(
      historicalLifecycleForMission(mission, new Date('2026-04-07T05:30:00.000Z')),
    ).toBe('expired');
  });

  it('uses the all-day scheduled finish as the start of the 30-day completion window', () => {
    const schedule = createZonedAllDaySchedule({
      localDate: '2026-09-01',
      timeZone: 'Asia/Hong_Kong',
      estimatedEffortMinutes: 90,
    });
    const mission = occurrence(schedule);

    expect(
      historicalLifecycleForMission(mission, new Date('2026-10-01T15:59:59.999Z')),
    ).toBe('active');
    expect(
      historicalLifecycleForMission(mission, new Date('2026-10-01T16:00:00.000Z')),
    ).toBe('expired');
  });

  it('keeps completed and cancelled states historically authoritative', () => {
    const schedule = createZonedTimedSchedule({
      localStart: '2026-09-01T09:00:00',
      localFinish: '2026-09-01T09:30:00',
      timeZone: 'UTC',
      timeBehavior: 'local_time',
    });

    expect(
      historicalLifecycleForMission(
        occurrence(schedule, { completionState: 'completed' }),
        new Date('2027-01-01T00:00:00.000Z'),
      ),
    ).toBe('completed');
    expect(
      historicalLifecycleForMission(
        occurrence(schedule, { scheduleState: 'cancelled' }),
        new Date('2027-01-01T00:00:00.000Z'),
      ),
    ).toBe('cancelled');
  });
});