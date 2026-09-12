import { describe, expect, it } from 'vitest';

import { resolveMissionNotificationNavigation } from './notification-navigation.js';

const FIRST_ID = '323e4567-e89b-42d3-a456-426614174001';
const SECOND_ID = '323e4567-e89b-42d3-a456-426614174002';

describe('MTS-064 notification tap navigation', () => {
  it('opens Mission Details for a single mission while preserving its selected day', () => {
    expect(
      resolveMissionNotificationNavigation({
        localDate: '2026-09-14',
        occurrenceIds: [FIRST_ID],
      }),
    ).toEqual({
      kind: 'mission-details',
      date: '2026-09-14',
      missionId: FIRST_ID,
      occurrenceIds: [FIRST_ID],
    });
  });

  it('opens the selected Calendar day and highlights every mission in a combined notification', () => {
    expect(
      resolveMissionNotificationNavigation({
        localDate: '2026-09-14',
        occurrenceIds: [SECOND_ID, FIRST_ID],
      }),
    ).toEqual({
      kind: 'calendar-group',
      date: '2026-09-14',
      occurrenceIds: [FIRST_ID, SECOND_ID],
    });
  });

  it('rejects malformed notification payloads instead of navigating', () => {
    expect(resolveMissionNotificationNavigation({ localDate: '2026-09-14', occurrenceIds: [] })).toBeNull();
    expect(resolveMissionNotificationNavigation({ localDate: 'bad-date', occurrenceIds: [FIRST_ID] })).toBeNull();
  });
});
