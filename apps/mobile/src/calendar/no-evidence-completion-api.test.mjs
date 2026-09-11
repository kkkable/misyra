import { describe, expect, it, vi } from 'vitest';

import { completeMissionWithoutEvidence } from './no-evidence-completion-api.js';

const occurrenceId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const completionId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const actionTime = '2026-09-11T10:55:00.000Z';

describe('MTS-059 no-evidence completion mobile API', () => {
  it.each(['private', 'trust'])(
    'posts %s completion without camera or evidence fields',
    async (mode) => {
      const completionType = mode === 'private' ? 'private' : 'trust_mode';
      const fetcher = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          version: 1,
          requestId,
          ok: true,
          payload: {
            status: 'completed',
            occurrenceId,
            completionId,
            completionType,
            actionTime,
            reward: { baseXp: 100, proofBonusXp: 0, awardedXp: 100 },
          },
        }),
      }));

      await completeMissionWithoutEvidence({
        baseUrl: 'https://api.example.test/',
        accessToken: 'fixture-access-token',
        occurrenceId,
        mode,
        effectiveActionAt: actionTime,
        deviceId,
        idempotencyKey: 'idempotency-1',
        fetcher,
      });

      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0];
      expect(url).toBe(`https://api.example.test/v1/missions/${occurrenceId}/complete`);
      expect(init).toMatchObject({
        method: 'POST',
        headers: {
          authorization: 'Bearer fixture-access-token',
          'content-type': 'application/json',
        },
      });
      const body = JSON.parse(init.body);
      expect(body).toEqual({
        completionMode: mode,
        effectiveActionAt: actionTime,
        deviceId,
        idempotencyKey: 'idempotency-1',
      });
      expect(body).not.toHaveProperty('evidenceAttemptId');
      expect(body).not.toHaveProperty('camera');
    },
  );

  it('rejects an unsuccessful completion response', async () => {
    await expect(
      completeMissionWithoutEvidence({
        baseUrl: 'https://api.example.test',
        accessToken: 'fixture-access-token',
        occurrenceId,
        mode: 'private',
        effectiveActionAt: actionTime,
        deviceId,
        idempotencyKey: 'idempotency-1',
        fetcher: vi.fn(async () => ({
          ok: false,
          json: async () => ({
            version: 1,
            requestId,
            ok: false,
            error: {
              version: 1,
              code: 'conflict',
              retryable: false,
              messageKey: 'completion.conflict',
            },
          }),
        })),
      }),
    ).rejects.toThrow('completion_request_failed');
  });
});
