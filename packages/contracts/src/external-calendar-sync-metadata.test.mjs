import { describe, expect, it } from 'vitest';

import {
  synchronizedProviderChangeBatchSchema,
  synchronizedProviderEventSchema,
} from './external-calendar-sync.js';

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
  it('requires a provider update instant on synchronized events', () => {
    expect(synchronizedProviderEventSchema.parse(providerEvent)).toEqual(providerEvent);

    const missingTimestamp = { ...providerEvent };
    delete missingTimestamp.providerUpdatedAt;
    expect(() => synchronizedProviderEventSchema.parse(missingTimestamp)).toThrow();
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

    expect(synchronizedProviderChangeBatchSchema.parse(batch)).toEqual(batch);
  });
});
