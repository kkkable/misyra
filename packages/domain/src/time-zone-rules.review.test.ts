import { describe, expect, it } from 'vitest';

import { resolveEffectiveTimestamp } from './time-zone-rules.js';

describe('MTS-016 clock validation review regression', () => {
  it('falls back silently when an invalid device timestamp is malformed', () => {
    const serverReceiptTime = '2026-09-01T00:00:05.000Z';

    expect(
      resolveEffectiveTimestamp({
        clientTime: 'not-a-timestamp',
        serverReceiptTime,
        validationResult: 'invalid',
      }),
    ).toEqual({
      originalClientTime: 'not-a-timestamp',
      serverReceiptTime,
      effectiveTime: serverReceiptTime,
      validationResult: 'invalid',
    });
  });
});
