import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  StoryTextSuggestionContextError,
  StoryTextSuggestionUnsafeClaimError,
} from './story-text-suggestions.js';
import { createApiServer } from './index.js';
import { createStoryTextSuggestionRoutes } from './story-text-suggestions-routes.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const occurrenceId = '22222222-2222-4222-8222-222222222222';

function output() {
  return {
    headline: 'Done before dinner',
    supportingText: 'A steady 5K after work.',
    sharingNotes: {
      musicMood: 'upbeat running track',
      mention: null,
      location: 'Hong Kong',
      poll: null,
    },
  };
}

describe('MTS-092 Story text suggestion route', () => {
  it('uses authenticated account context and exposes no client-supplied AI context', async () => {
    const suggest = vi.fn(() => Promise.resolve(output()));
    const server = createApiServer({
      authenticate: () => ({ accountId }),
      routes: createStoryTextSuggestionRoutes({ suggest }),
    });

    const response = await server.inject({
      method: 'POST',
      url: `/v1/stories/${occurrenceId}/text-suggestions`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, payload: output() });
    expect(suggest).toHaveBeenCalledWith(accountId, occurrenceId);
    await server.close();
  });

  it('fails closed without a configured provider and hides unavailable/non-owned context', async () => {
    const unavailable = createApiServer({
      authenticate: () => ({ accountId }),
      routes: createStoryTextSuggestionRoutes(),
    });
    expect(
      (
        await unavailable.inject({
          method: 'POST',
          url: `/v1/stories/${occurrenceId}/text-suggestions`,
        })
      ).statusCode,
    ).toBe(503);
    await unavailable.close();

    const contextMissing = createApiServer({
      authenticate: () => ({ accountId }),
      routes: createStoryTextSuggestionRoutes({
        suggest: vi.fn(() => Promise.reject(new StoryTextSuggestionContextError())),
      }),
    });
    expect(
      (
        await contextMissing.inject({
          method: 'POST',
          url: `/v1/stories/${occurrenceId}/text-suggestions`,
        })
      ).statusCode,
    ).toBe(404);
    await contextMissing.close();

    const unsafe = createApiServer({
      authenticate: () => ({ accountId }),
      routes: createStoryTextSuggestionRoutes({
        suggest: vi.fn(() => Promise.reject(new StoryTextSuggestionUnsafeClaimError())),
      }),
    });
    expect(
      (
        await unsafe.inject({
          method: 'POST',
          url: `/v1/stories/${occurrenceId}/text-suggestions`,
        })
      ).statusCode,
    ).toBe(503);
    await unsafe.close();
  });

  it('is mounted by the executable API application through provider-neutral service injection', () => {
    const application = readFileSync(new URL('./application.ts', import.meta.url), 'utf8');
    expect(application).toMatch(/createStoryTextSuggestionRoutes/);
    expect(application).toMatch(/storyTextSuggestionService/);
  });
});
