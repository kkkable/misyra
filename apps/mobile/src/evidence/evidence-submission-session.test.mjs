import { describe, expect, it, vi } from 'vitest';

import { createEvidenceSubmissionSession } from './evidence-submission-session.js';

describe('MTS-082 evidence submission attempt reuse', () => {
  it('reuses one attempt id and submit timestamp when the same submit must be retried', () => {
    const generateAttemptId = vi
      .fn()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
    const now = vi.fn(() => new Date('2026-09-20T08:00:00.000Z'));
    const session = createEvidenceSubmissionSession(generateAttemptId, now);

    const first = session.getOrCreate();
    const retry = session.getOrCreate();

    expect(retry).toBe(first);
    expect(retry).toEqual({
      attemptId: '11111111-1111-4111-8111-111111111111',
      submittedAt: '2026-09-20T08:00:00.000Z',
    });
    expect(generateAttemptId).toHaveBeenCalledTimes(1);
    expect(now).toHaveBeenCalledTimes(1);
  });

  it('starts a new attempt only after the user chooses Try another photo', () => {
    const generateAttemptId = vi
      .fn()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
    const now = vi
      .fn()
      .mockReturnValueOnce(new Date('2026-09-20T08:00:00.000Z'))
      .mockReturnValueOnce(new Date('2026-09-20T08:05:00.000Z'));
    const session = createEvidenceSubmissionSession(generateAttemptId, now);

    expect(session.getOrCreate().attemptId).toBe('11111111-1111-4111-8111-111111111111');
    session.reset();
    expect(session.getOrCreate()).toEqual({
      attemptId: '22222222-2222-4222-8222-222222222222',
      submittedAt: '2026-09-20T08:05:00.000Z',
    });
  });
});
