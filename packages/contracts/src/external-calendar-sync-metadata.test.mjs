import { describe, expect, it } from 'vitest';

import { normalizedProviderEventSchema, providerChangeBatchSchema } from './external-calendar.js';

const timedSchedule = {
  type: 'timed',
  startInstant: '2026-09-15T01:00:00.000Z',
  finishInstant: '2026-09-15T02:00:00.000Z',
  timeZone: 'Asia/Hong_Kong',
  timeBehavior: 'fixed_instant',
};

const providerEvent = {
  providerCalendarId: 'calendar-1',
  providerEventId: 'event-1',
  providerUpdatedAt: '2026-09-13T02:00:00.000Z',
  title: 'Provider event',
  schedule: timedSchedule,
  recurrence: null,
  location: null,
  providerNotes: null,
  status: 'confirmed',
  ownership: 'app_owned',
};

describe('MTS-070 provider edit timestamp contract', () => {
  it('requires a provider update instant on normalized events', () => {
    expect(normalizedProviderEventSchema.parse(providerEvent)).toEqual(providerEvent);

    const { providerUpdatedAt: _providerUpdatedAt, ...missingTimestamp } = providerEvent;
    expect(() => normalizedProviderEventSchema.parse(missingTimestamp)).toThrow();
  });

  it('carries the provider update instant on delete changes for latest-valid ordering', () => {
    const batch = {
      changes: [
        {
          type: 'delete',
          providerEventId: 'event-1',
          providerUpdatedAt: '2026-09-13T03:00:00.000Z',
          recurrenceScope: 'entire_series',
        },
      ],
      cursor: 'sync-token-next',
    };

    expect(providerChangeBatchSchema.parse(batch)).toEqual(batch);
  });
});
