import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { createEvidenceAttemptService } from './evidence-attempt.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const occurrenceId = '22222222-2222-4222-8222-222222222222';

describe('MTS-091 Story source evidence discovery', () => {
  it('returns retained uploaded evidence attempts in attempt order and excludes duplicate-loser/deleted media in SQL', async () => {
    const query = vi.fn((_sql: string, _params: readonly string[]) =>
      Promise.resolve({
        rows: [
          {
            attemptId: '33333333-3333-4333-8333-333333333333',
            attemptNumber: 1,
            effectiveSubmittedAt: new Date('2026-09-23T06:00:00.000Z'),
            verificationStatus: 'rejected',
          },
          {
            attemptId: '44444444-4444-4444-8444-444444444444',
            attemptNumber: 2,
            effectiveSubmittedAt: new Date('2026-09-23T06:10:00.000Z'),
            verificationStatus: 'accepted',
          },
        ],
      }),
    );
    const service = createEvidenceAttemptService({
      pool: { query } as unknown as Pool,
      protectedMediaService: {
        authorizeUpload: vi.fn(),
        readAssetOriginal: vi.fn(),
        deleteAsset: vi.fn(),
      },
    });

    await expect(service.listStorySources(accountId, occurrenceId)).resolves.toEqual({
      attempts: [
        {
          attemptId: '33333333-3333-4333-8333-333333333333',
          attemptNumber: 1,
          effectiveSubmittedAt: '2026-09-23T06:00:00.000Z',
          verificationStatus: 'rejected',
        },
        {
          attemptId: '44444444-4444-4444-8444-444444444444',
          attemptNumber: 2,
          effectiveSubmittedAt: '2026-09-23T06:10:00.000Z',
          verificationStatus: 'accepted',
        },
      ],
    });

    expect(query).toHaveBeenCalledTimes(1);
    const call = query.mock.calls[0];
    expect(call).toBeDefined();
    if (call === undefined) throw new Error('Expected one Story source query.');
    const [sql, params] = call;
    expect(sql).toMatch(/upload_status\s*=\s*'uploaded'/i);
    expect(sql).toMatch(/deletion_state\s*=\s*'active'/i);
    expect(sql).toMatch(/status\s*<>\s*'duplicate_loser'/i);
    expect(sql).toMatch(/ORDER BY\s+a\.attempt_number/i);
    expect(params).toEqual([accountId, occurrenceId]);
  });
});
