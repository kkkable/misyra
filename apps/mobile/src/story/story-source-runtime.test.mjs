import { describe, expect, it, vi } from 'vitest';

import { createStorySourceRuntime } from './story-source-runtime.ts';

describe('MTS-091 Story source-photo runtime', () => {
  it('lists all retained evidence attempts and materializes only the selected photo into story-working', async () => {
    const api = {
      listStorySourceAttempts: vi.fn(() =>
        Promise.resolve([
          {
            attemptId: '11111111-1111-4111-8111-111111111111',
            attemptNumber: 1,
            effectiveSubmittedAt: '2026-09-23T06:00:00.000Z',
            verificationStatus: 'rejected',
          },
          {
            attemptId: '22222222-2222-4222-8222-222222222222',
            attemptNumber: 2,
            effectiveSubmittedAt: '2026-09-23T06:10:00.000Z',
            verificationStatus: 'accepted',
          },
        ]),
      ),
    };
    const files = {
      copyOriginalToStoryWorking: vi.fn(() =>
        Promise.resolve({
          uri: 'file:///documents/misyra/story-working/33333333-3333-4333-8333-333333333333.jpg',
          width: 3024,
          height: 4032,
        }),
      ),
    };
    const runtime = createStorySourceRuntime({ api, files });

    await expect(runtime.list('occurrence-1')).resolves.toHaveLength(2);
    await expect(
      runtime.materialize(
        {
          attemptId: '22222222-2222-4222-8222-222222222222',
          attemptNumber: 2,
          effectiveSubmittedAt: '2026-09-23T06:10:00.000Z',
          verificationStatus: 'accepted',
        },
        '33333333-3333-4333-8333-333333333333',
      ),
    ).resolves.toEqual({
      attemptId: '22222222-2222-4222-8222-222222222222',
      imageVersionId: '33333333-3333-4333-8333-333333333333',
      uri: 'file:///documents/misyra/story-working/33333333-3333-4333-8333-333333333333.jpg',
      width: 3024,
      height: 4032,
    });

    expect(files.copyOriginalToStoryWorking).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    );
  });
});
