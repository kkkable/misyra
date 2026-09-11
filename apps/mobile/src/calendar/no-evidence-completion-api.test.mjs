import { describe, expect, it, vi } from 'vitest';

import { completeMissionWithoutEvidence } from './no-evidence-completion-api.js';

describe('MTS-059 no-evidence completion mobile API', () => {
  it.each(['private', 'trust'])('posts %s completion without camera or evidence fields', async (mode) => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, payload: { status: 'completed' } }),
    }));

    await completeMissionWithoutEvidence({
      baseUrl: 'https://api.example.test/',
      accessToken: 'access-token',
      occurrenceId: 'occurrence-1',
      mode,
      effectiveActionAt: '2026-09-11T10:55:00.000Z',
      deviceId: 'device-1',
      idempotencyKey: 'idempotency-1',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.example.test/v1/missions/occurrence-1/complete');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer access-token',
        'content-type': 'application/json',
      },
    });
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      completionMode: mode,
      effectiveActionAt: '2026-09-11T10:55:00.000Z',
      deviceId: 'device-1',
      idempotencyKey: 'idempotency-1',
    });
    expect(body).not.toHaveProperty('evidenceAttemptId');
    expect(body).not.toHaveProperty('camera');
  });

  it('rejects an unsuccessful completion response', async () => {
    await expect(
      completeMissionWithoutEvidence({
        baseUrl: 'https://api.example.test',
        accessToken: 'access-token',
        occurrenceId: 'occurrence-1',
        mode: 'private',
        effectiveActionAt: '2026-09-11T10:55:00.000Z',
        deviceId: 'device-1',
        idempotencyKey: 'idempotency-1',
        fetcher: vi.fn(async () => ({
          ok: false,
          json: async () => ({ ok: false }),
        })),
      }),
    ).rejects.toThrow('completion_request_failed');
  });
});
