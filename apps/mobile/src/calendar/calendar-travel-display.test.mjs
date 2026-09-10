import { readFile } from 'node:fs/promises';

import { createMissionOccurrence, createZonedTimedSchedule } from '@misyra/domain';
import { describe, expect, it } from 'vitest';

import { projectMissionOccurrenceForAppTimeZone } from './calendar-travel-projection.js';

const baseOccurrence = {
  id: '11111111-1111-4111-8111-111111111111',
  seriesId: '22222222-2222-4222-8222-222222222222',
  scheduleState: 'scheduled',
  completionState: 'incomplete',
  evidenceState: 'not_submitted',
  rewardEligibility: 'eligible',
  rewardIssuance: 'not_issued',
  synchronizationState: 'synced',
  storyState: 'none',
  deletionState: 'active',
};

describe('MTS-053 Calendar travel projection', () => {
  it('keeps internal local-time missions at the same wall clock when the app zone changes', () => {
    const occurrence = createMissionOccurrence({
      ...baseOccurrence,
      calendarSource: 'internal',
      fieldOwnership: 'app_owned',
      schedule: createZonedTimedSchedule({
        localStart: '2026-09-10T09:00:00',
        localFinish: '2026-09-10T09:30:00',
        timeZone: 'Asia/Tokyo',
        timeBehavior: 'local_time',
      }),
    });

    const projected = projectMissionOccurrenceForAppTimeZone(occurrence, 'Europe/London');

    expect(projected.schedule.timeBehavior).toBe('local_time');
    expect(projected.schedule.timeZone).toBe('Europe/London');
    expect(projected.schedule.localStart).toBe('2026-09-10T09:00:00');
    expect(projected.schedule.startInstant).not.toBe(occurrence.schedule.startInstant);
  });

  it('preserves a provider fixed instant for imported events and renders that instant in the current app zone', () => {
    const occurrence = createMissionOccurrence({
      ...baseOccurrence,
      calendarSource: 'external',
      fieldOwnership: 'organizer_controlled',
      schedule: createZonedTimedSchedule({
        localStart: '2026-09-10T09:00:00',
        localFinish: '2026-09-10T10:00:00',
        timeZone: 'Asia/Tokyo',
        timeBehavior: 'fixed_instant',
      }),
    });

    const projected = projectMissionOccurrenceForAppTimeZone(occurrence, 'Europe/London');

    expect(projected.schedule.timeBehavior).toBe('fixed_instant');
    expect(projected.schedule.startInstant).toBe(occurrence.schedule.startInstant);
    expect(projected.schedule.finishInstant).toBe(occurrence.schedule.finishInstant);
    expect(projected.schedule.localStart).toBe('2026-09-10T01:00:00');
    expect(projected.schedule.timeZone).toBe('Europe/London');
  });

  it('does not move completed historical occurrences when the current app zone changes', () => {
    const occurrence = createMissionOccurrence({
      ...baseOccurrence,
      calendarSource: 'external',
      fieldOwnership: 'organizer_controlled',
      completionState: 'completed',
      evidenceState: 'not_required',
      rewardIssuance: 'issued',
      schedule: createZonedTimedSchedule({
        localStart: '2026-09-09T09:00:00',
        localFinish: '2026-09-09T10:00:00',
        timeZone: 'Asia/Tokyo',
        timeBehavior: 'fixed_instant',
      }),
    });

    const projected = projectMissionOccurrenceForAppTimeZone(occurrence, 'Europe/London');

    expect(projected.schedule).toEqual(occurrence.schedule);
  });

  it('wires the Calendar route to the persisted app-zone runtime instead of reading device time zone ad hoc', async () => {
    const source = await readFile(new URL('./calendar-route-screen.tsx', import.meta.url), 'utf8');
    expect(source).toContain('useAppTimeZone');
    expect(source).toContain('projectMissionOccurrenceForAppTimeZone');
  });
});
