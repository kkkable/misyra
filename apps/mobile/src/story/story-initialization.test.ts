import { describe, expect, it, vi } from 'vitest';

import {
  initializeSourceFreeStory,
  StoryGenerationBudgetExhaustedError,
  StoryInitialImageUnavailableError,
} from './story-initialization.js';

const payload = { draftId: '11111111-1111-4111-8111-111111111111', versions: [] as string[] };
const version = {
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'generated' as const,
  storageKey: 'story/generated/initial',
};

function harness() {
  const save = vi.fn(() => Promise.resolve());
  const synchronize = vi.fn(() => Promise.resolve());
  const getBudget = vi.fn(() => Promise.resolve({ remainingGenerations: 3 }));
  const generate = vi.fn(() =>
    Promise.resolve({ version, remainingGenerations: 2 }),
  );
  const appendGeneratedVersion = vi.fn((value, generated) => ({
    ...value,
    versions: [...value.versions, generated.id],
  }));
  const sourceImage = {
    id: version.id,
    uri: 'file:///story/initial.jpg',
    width: 1080,
    height: 1920,
  };
  const materialize = vi.fn(() => Promise.resolve(sourceImage));
  return {
    save,
    synchronize,
    getBudget,
    generate,
    appendGeneratedVersion,
    materialize,
    sourceImage,
  };
}

describe('MTS-109 cross-ticket source-free Story initialization', () => {
  it('syncs an empty completed-mission draft then consumes one AI request for the first image', async () => {
    const input = harness();

    await expect(initializeSourceFreeStory({ payload, ...input })).resolves.toEqual({
      payload: { ...payload, versions: [version.id] },
      sourceImage: input.sourceImage,
      imageVersionId: version.id,
      remainingGenerations: 2,
    });

    expect(input.save).toHaveBeenNthCalledWith(1, payload);
    expect(input.synchronize).toHaveBeenCalledTimes(1);
    expect(input.getBudget).toHaveBeenCalledTimes(1);
    expect(input.generate).toHaveBeenCalledTimes(1);
    expect(input.save).toHaveBeenNthCalledWith(2, {
      ...payload,
      versions: [version.id],
    });
  });

  it('does not reset or bypass an exhausted mission-level budget', async () => {
    const input = harness();
    input.getBudget.mockResolvedValue({ remainingGenerations: 0 });

    await expect(initializeSourceFreeStory({ payload, ...input })).rejects.toBeInstanceOf(
      StoryGenerationBudgetExhaustedError,
    );
    expect(input.generate).not.toHaveBeenCalled();
  });

  it('keeps network/provider failures on the Story route instead of silently backing out', async () => {
    const input = harness();
    input.generate.mockRejectedValue(new Error('offline'));

    await expect(initializeSourceFreeStory({ payload, ...input })).rejects.toBeInstanceOf(
      StoryInitialImageUnavailableError,
    );
  });
});
