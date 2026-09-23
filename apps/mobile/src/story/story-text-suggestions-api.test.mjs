import { afterEach, describe, expect, it, vi } from 'vitest';

import { createStoryTextSuggestionsApi } from './story-text-suggestions-api.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('MTS-092 Story text suggestion mobile API', () => {
  it('posts only the occurrence target and validates the structured response', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            version: 1,
            requestId: '11111111-1111-4111-8111-111111111111',
            ok: true,
            payload: {
              headline: 'Done before dinner',
              supportingText: null,
              sharingNotes: {
                musicMood: 'upbeat',
                mention: null,
                location: null,
                poll: null,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    globalThis.fetch = fetch;

    const api = createStoryTextSuggestionsApi({
      baseUrl: 'https://api.example.test/',
      accessToken: 'token',
    });
    await expect(api.suggest('occurrence-1')).resolves.toMatchObject({
      headline: 'Done before dinner',
      supportingText: null,
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.test/v1/stories/occurrence-1/text-suggestions',
      {
        method: 'POST',
        headers: { authorization: 'Bearer token' },
      },
    );
  });
});
