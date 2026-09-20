import { describe, expect, it } from 'vitest';

import {
  resolveEvidenceResultFlow,
  resolveEvidenceResultRefreshDelay,
} from './evidence-result-flow.js';

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

describe('MTS-082 evidence result server-time refresh', () => {
  it('polls active verification every second without needing expiry metadata', () => {
    expect(
      resolveEvidenceResultRefreshDelay({
        verificationStatus: 'queued',
        expired: false,
        serverNow: null,
        expiresAt: null,
      }),
    ).toBe(1_000);
  });

  it('rechecks a rejected result at most hourly until the server-side expiry', () => {
    expect(
      resolveEvidenceResultRefreshDelay({
        verificationStatus: 'rejected',
        expired: false,
        serverNow: '2026-09-20T08:00:00.000Z',
        expiresAt: '2026-10-20T10:00:00.000Z',
      }),
    ).toBe(60 * 60 * 1_000);

    expect(
      resolveEvidenceResultRefreshDelay({
        verificationStatus: 'rejected',
        expired: false,
        serverNow: '2026-10-20T09:59:55.000Z',
        expiresAt: '2026-10-20T10:00:00.000Z',
      }),
    ).toBe(5_000);
  });

  it('stops refreshing accepted and server-expired results', () => {
    expect(
      resolveEvidenceResultRefreshDelay({
        verificationStatus: 'accepted',
        expired: false,
        serverNow: '2026-09-20T08:00:00.000Z',
        expiresAt: '2026-10-20T10:00:00.000Z',
      }),
    ).toBeNull();
    expect(
      resolveEvidenceResultRefreshDelay({
        verificationStatus: 'rejected',
        expired: true,
        serverNow: '2026-10-20T10:00:00.000Z',
        expiresAt: '2026-10-20T10:00:00.000Z',
      }),
    ).toBeNull();
  });
});
