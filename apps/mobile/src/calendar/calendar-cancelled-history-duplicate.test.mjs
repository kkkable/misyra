import { describe, expect, it } from 'vitest';

import { prepareCalendarMissionDuplicate } from './calendar-mission-duplicate.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const seriesId = '22222222-2222-4222-8222-222222222222';
const occurrenceId = '33333333-3333-4333-8333-333333333333';

function cancelledImportedOccurrence() {
  return {
    id: occurrenceId,
    seriesId,
    schedule: {
      localStart: '2026-09-13T09:15:00',
      localFinish: '2026-09-13T10:00:00',
      startInstant: '2026-09-13T09:15:00.000Z',
      finishInstant: '2026-09-13T10:00:00.000Z',
      timeZone: 'UTC',
      timeBehavior: 'fixed_instant',
      allDay: false,
      estimatedEffortMinutes: null,
    },
    scheduleState: 'cancelled',
    completionState: 'incomplete',
    evidenceState: 'not_required',
    rewardEligibility: 'ineligible',
    rewardIssuance: 'not_issued',
    calendarSource: 'external',
    fieldOwnership: 'organizer_controlled',
    synchronizationState: 'synced',
    storyState: 'none',
    deletionState: 'active',
  };
}

describe('MTS-074 cancelled-history duplication', () => {
  it('creates a fresh state-free draft for today while preserving the original clock time', async () => {
    const database = {
      async getFirstAsync() {
        return {
          title: 'Cancelled appointment',
          payload_json: JSON.stringify(cancelledImportedOccurrence()),
          location: 'Kowloon',
          general_note: null,
          personal_note: 'Bring the printed form',
        };
      },
    };

    const draft = await prepareCalendarMissionDuplicate({
      database,
      accountId,
      occurrenceId,
      now: new Date('2026-09-14T12:00:00.000Z'),
    });

    expect(draft).toMatchObject({
      selectedDate: '2026-09-14',
      title: 'Cancelled appointment',
      allDay: false,
      startMinute: 9 * 60 + 15,
      endMinute: 10 * 60,
      rewardEligibility: 'eligible',
      timeZone: 'UTC',
      timeBehavior: 'fixed_instant',
      private: true,
      location: 'Kowloon',
      notes: 'Bring the printed form',
    });

    for (const forbidden of [
      'id',
      'seriesId',
      'scheduleState',
      'completionState',
      'evidenceState',
      'rewardIssuance',
      'storyState',
      'calendarSource',
      'fieldOwnership',
      'synchronizationState',
      'deletionState',
      'provider',
      'externalEventId',
      'attendeeState',
      'cancellationState',
    ]) {
      expect(draft).not.toHaveProperty(forbidden);
    }
  });
});
