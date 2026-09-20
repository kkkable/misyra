import { describe, expect, it } from 'vitest';

import { resolveEvidenceResultFlow } from './evidence-result-flow.js';

describe('MTS-082 evidence result flow matrix', () => {
  it.each([
    [
      'pending verification',
      { verificationStatus: 'queued', attemptNumber: 1, expired: false, reasonCode: null },
      {
        state: 'waiting',
        remainingAttempts: 2,
        canRetry: false,
        canSelfConfirm: false,
        reasonMessageKey: null,
      },
    ],
    [
      'first rejection',
      {
        verificationStatus: 'rejected',
        attemptNumber: 1,
        expired: false,
        reasonCode: 'task_mismatch',
      },
      {
        state: 'rejected',
        remainingAttempts: 2,
        canRetry: true,
        canSelfConfirm: true,
        reasonMessageKey: 'evidence.result.reason.taskMismatch',
      },
    ],
    [
      'second rejection',
      {
        verificationStatus: 'rejected',
        attemptNumber: 2,
        expired: false,
        reasonCode: 'task_not_evident',
      },
      {
        state: 'rejected',
        remainingAttempts: 1,
        canRetry: true,
        canSelfConfirm: true,
        reasonMessageKey: 'evidence.result.reason.taskNotEvident',
      },
    ],
    [
      'final rejection',
      {
        verificationStatus: 'rejected',
        attemptNumber: 3,
        expired: false,
        reasonCode: 'image_unusable',
      },
      {
        state: 'rejected',
        remainingAttempts: 0,
        canRetry: false,
        canSelfConfirm: true,
        reasonMessageKey: 'evidence.result.reason.imageUnusable',
      },
    ],
    [
      'expired rejection',
      {
        verificationStatus: 'rejected',
        attemptNumber: 1,
        expired: true,
        reasonCode: 'task_mismatch',
      },
      {
        state: 'expired',
        remainingAttempts: 2,
        canRetry: false,
        canSelfConfirm: false,
        reasonMessageKey: 'evidence.result.reason.taskMismatch',
      },
    ],
    [
      'accepted verification',
      {
        verificationStatus: 'accepted',
        attemptNumber: 2,
        expired: false,
        reasonCode: 'verified',
      },
      {
        state: 'accepted',
        remainingAttempts: 1,
        canRetry: false,
        canSelfConfirm: false,
        reasonMessageKey: null,
      },
    ],
  ])('%s', (_label, input, expected) => {
    expect(resolveEvidenceResultFlow(input)).toEqual(expected);
  });

  it('never exposes raw model text as a reason', () => {
    const result = resolveEvidenceResultFlow({
      verificationStatus: 'rejected',
      attemptNumber: 1,
      expired: false,
      reasonCode: 'task_mismatch',
    });

    expect(result.reasonMessageKey).toBe('evidence.result.reason.taskMismatch');
    expect(JSON.stringify(result)).not.toContain('model');
  });
});
