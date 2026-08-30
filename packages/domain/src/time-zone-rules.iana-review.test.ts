import { describe, expect, it } from 'vitest';

import { createZonedTimedSchedule } from './time-zone-rules.js';

describe('MTS-016 IANA-zone review regression', () => {
  it('rejects raw UTC-offset identifiers because mission zones must be IANA IDs', () => {
    expect(() =>
      createZonedTimedSchedule({
        localStart: '2026-09-01T09:00:00',
        localFinish: '2026-09-01T10:00:00',
        timeZone: '+08:00',
        timeBehavior: 'local_time',
      }),
    ).toThrow(/IANA time zone/i);
  });
});
