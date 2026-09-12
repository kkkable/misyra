import { describe, expect, it } from 'vitest';

import { resolveLocalDateTimeInstant } from './time-zone-rules.js';

describe('MTS-063 notification wall-time conversion', () => {
  it('resolves 09:00 in the mission IANA zone across a DST transition', () => {
    expect(resolveLocalDateTimeInstant('2026-11-01T09:00:00', 'America/New_York')).toBe(
      '2026-11-01T14:00:00.000Z',
    );
  });
});
