import { describe, expect, it } from 'vitest';

import {
  completeMissionCommandSchema,
  completeMissionRequestSchema,
  completeMissionResultSchema,
} from './v1/completion.js';

const occurrenceId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const completionId = '33333333-3333-4333-8333-333333333333';
const actionTime = '2026-09-11T10:55:00.000Z';

describe('MTS-059 completion contracts', () => {
  it.each(['private', 'trust'])('accepts a spec-valid %s completion command', (completionMode) => {
    expect(
      completeMissionCommandSchema.parse({
        occurrenceId,
        completionMode,
        effectiveActionAt: actionTime,
        deviceId,
        idempotencyKey: 'completion-command-1',
      }),
    ).toMatchObject({ occurrenceId, completionMode, deviceId });
  });

  it('keeps occurrence identity in the path contract and rejects unapproved request fields', () => {
    expect(
      completeMissionRequestSchema.parse({
        completionMode: 'private',
        effectiveActionAt: actionTime,
        deviceId,
        idempotencyKey: 'completion-request-1',
      }),
    ).not.toHaveProperty('occurrenceId');

    expect(() =>
      completeMissionRequestSchema.parse({
        occurrenceId,
        completionMode: 'private',
        effectiveActionAt: actionTime,
        deviceId,
        idempotencyKey: 'completion-request-2',
        camera: true,
      }),
    ).toThrow();
  });

  it.each(['private', 'trust_mode'])('accepts an authoritative %s completion result', (completionType) => {
    expect(
      completeMissionResultSchema.parse({
        status: 'completed',
        occurrenceId,
        completionId,
        completionType,
        actionTime,
        reward: { baseXp: 100, proofBonusXp: 0, awardedXp: 100 },
      }),
    ).toMatchObject({ completionType, reward: { proofBonusXp: 0, awardedXp: 100 } });
  });

  it('rejects malformed completion identities and reward values', () => {
    expect(() =>
      completeMissionResultSchema.parse({
        status: 'completed',
        occurrenceId: 'not-a-uuid',
        completionId,
        completionType: 'private',
        actionTime,
        reward: { baseXp: 100, proofBonusXp: -1, awardedXp: 99 },
      }),
    ).toThrow();
  });
});
