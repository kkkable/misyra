import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { createApiServer } from './index.js';
import { createStoryImageGenerationRoutes } from './story-image-generation-routes.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const draftId = '22222222-2222-4222-8222-222222222222';
const sourceVersionId = '33333333-3333-4333-8333-333333333333';

describe('MTS-094 Story image generation routes', () => {
  it('returns the authoritative remaining generation budget', async () => {
    const getBudget = vi.fn(() => Promise.resolve({ remainingGenerations: 2 }));
    const server = createApiServer({
      authenticate: () => ({ accountId }),
      routes: createStoryImageGenerationRoutes({
        getBudget,
        generate: vi.fn(() => Promise.reject(new Error('not used'))),
      }),
    });

    const response = await server.inject({
      method: 'GET',
      url: `/v1/stories/${draftId}/image-generation-budget`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      payload: { remainingGenerations: 2 },
    });
    expect(getBudget).toHaveBeenCalledWith(accountId, draftId);
    await server.close();
  });

  it('generates exactly through the authenticated draft route', async () => {
    const result = {
      version: {
        id: '44444444-4444-4444-8444-444444444444',
        kind: 'generated',
        storageKey: 'story/generated/route',
      },
      remainingGenerations: 1,
    } as const;
    const generate = vi.fn(() => Promise.resolve(result));
    const server = createApiServer({
      authenticate: () => ({ accountId }),
      routes: createStoryImageGenerationRoutes({
        getBudget: vi.fn(() => Promise.resolve({ remainingGenerations: 2 })),
        generate,
      }),
    });

    const response = await server.inject({
      method: 'POST',
      url: `/v1/stories/${draftId}/image-generations`,
      payload: { sourceVersionId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, payload: result });
    expect(generate).toHaveBeenCalledWith(accountId, { draftId, sourceVersionId });
    await server.close();
  });

  it('is mounted by the executable API application', () => {
    const application = readFileSync(new URL('./application.ts', import.meta.url), 'utf8');
    expect(application).toMatch(/createStoryImageGenerationRoutes/);
    expect(application).toMatch(/storyImageGenerationService/);
  });
});
