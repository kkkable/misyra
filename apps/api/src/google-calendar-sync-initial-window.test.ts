import { describe, expect, it } from 'vitest';

import type { NormalizedCalendarRecurrence, SynchronizedProviderEvent } from '@misyra/contracts';

import { projectFutureOnlyInitialImport } from './google-calendar-initial-window.js';

const now = new Date('2026-09-13T03:00:00.000Z');

function timedEvent(
  id: string,
  startInstant: string,
  finishInstant: string,
  recurrence: NormalizedCalendarRecurrence | null = null,
): SynchronizedProviderEvent {
  return {
    providerCalendarId: 'calendar-1',
    providerEventId: id,
    providerUpdatedAt: '2026-09-13T02:00:00.000Z',
    title: id,
    schedule: {
      type: 'timed',
      startInstant,
      finishInstant,
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'fixed_instant',
    },
    recurrence,
    location: null,
    providerNotes: null,
    status: 'confirmed',
    ownership: 'app_owned',
  };
}

describe('MTS-070 future-only initial Google migration', () => {
  it('leaves past one-time provider events unchanged during initial import', () => {
    const batch = projectFutureOnlyInitialImport(
      {
        events: [
          timedEvent('past', '2026-09-12T01:00:00.000Z', '2026-09-12T02:00:00.000Z'),
          timedEvent('future', '2026-09-15T01:00:00.000Z', '2026-09-15T02:00:00.000Z'),
        ],
        cursor: 'sync-token-next',
      },
      now,
    );

    expect(batch.events.map((event) => event.providerEventId)).toEqual(['future']);
    expect(batch.cursor).toBe('sync-token-next');
  });

  it('reanchors a recurring provider series to its first unfinished occurrence', () => {
    const batch = projectFutureOnlyInitialImport(
      {
        events: [
          timedEvent('weekly', '2026-09-01T01:00:00.000Z', '2026-09-01T02:00:00.000Z', {
            pattern: { type: 'weekly', interval: 1, weekdays: [2], weekStartsOn: 1 },
            end: { type: 'count', occurrenceCount: 4 },
          }),
        ],
        cursor: 'sync-token-next',
      },
      now,
    );

    expect(batch.events).toHaveLength(1);
    expect(batch.events[0]).toMatchObject({
      providerEventId: 'weekly',
      schedule: {
        type: 'timed',
        startInstant: '2026-09-15T01:00:00.000Z',
        finishInstant: '2026-09-15T02:00:00.000Z',
        timeZone: 'Asia/Hong_Kong',
      },
      recurrence: {
        pattern: {
          type: 'weekly',
          interval: 1,
          weekdays: [2],
          weekStartsOn: 1,
        },
        end: { type: 'count', occurrenceCount: 2 },
      },
    });
  });

  it('matches domain semantics when weekly recurrence weekdays contain duplicates', () => {
    const batch = projectFutureOnlyInitialImport(
      {
        events: [
          timedEvent('weekly-duplicates', '2026-09-01T01:00:00.000Z', '2026-09-01T02:00:00.000Z', {
            pattern: { type: 'weekly', interval: 1, weekdays: [2, 2, 4], weekStartsOn: 1 },
            end: { type: 'count', occurrenceCount: 6 },
          }),
        ],
        cursor: 'sync-token-next',
      },
      now,
    );

    expect(batch.events).toHaveLength(1);
    expect(batch.events[0]).toMatchObject({
      providerEventId: 'weekly-duplicates',
      schedule: {
        type: 'timed',
        startInstant: '2026-09-15T01:00:00.000Z',
        finishInstant: '2026-09-15T02:00:00.000Z',
      },
      recurrence: {
        end: { type: 'count', occurrenceCount: 2 },
      },
    });
  });

  it('omits recurring provider series with no unfinished occurrence remaining', () => {
    const batch = projectFutureOnlyInitialImport(
      {
        events: [
          timedEvent('exhausted', '2026-09-01T01:00:00.000Z', '2026-09-01T02:00:00.000Z', {
            pattern: { type: 'weekly', interval: 1, weekdays: [2], weekStartsOn: 1 },
            end: { type: 'count', occurrenceCount: 2 },
          }),
        ],
        cursor: 'sync-token-next',
      },
      now,
    );

    expect(batch.events).toEqual([]);
    expect(batch.cursor).toBe('sync-token-next');
  });
});
