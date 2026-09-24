import { describe, expect, it } from 'vitest';

import {
  activeStoryImageVersion,
  createStoryVersionState,
  deleteStoryGeneratedVersion,
  switchStoryImageVersion,
  updateActiveStoryComposition,
} from './story-version-state.ts';

function composition(text, scale, savedAt) {
  return {
    canvas: { width: 1080, height: 1920 },
    background: {
      scale,
      translateX: scale * 10,
      translateY: scale * -5,
      rotation: 0,
    },
    headline:
      text === null
        ? null
        : {
            text,
            x: 120,
            y: 260,
            width: 840,
            fontSize: 72,
            fontCategory: 'system-bold',
            color: '#FFFFFF',
          },
    supportingText: null,
    effects: text === null ? [] : [{ kind: 'contrast', amount: scale / 10 }],
    revision: 1,
    savedAt,
  };
}

const sourceId = '22222222-2222-4222-8222-222222222222';
const generatedId = '33333333-3333-4333-8333-333333333333';
const emptyGeneratedId = '44444444-4444-4444-8444-444444444444';
const sourceComposition = composition('Source only', 1, '2026-09-24T06:00:00.000Z');
const generatedComposition = composition('AI only', 2, '2026-09-24T06:01:00.000Z');
const emptyComposition = composition(null, 1, '2026-09-24T06:02:00.000Z');

const payload = {
  draftId: '11111111-1111-4111-8111-111111111111',
  notes: { musicMood: null, mention: null, location: null, poll: null },
  imageVersions: [
    {
      id: sourceId,
      kind: 'source',
      storageKey: 'story/source/source',
      composition: sourceComposition,
    },
    {
      id: generatedId,
      kind: 'generated',
      storageKey: 'story/generated/one',
      composition: generatedComposition,
    },
    {
      id: emptyGeneratedId,
      kind: 'generated',
      storageKey: 'story/generated/two',
      composition: emptyComposition,
    },
  ],
};

describe('MTS-095 Story version state', () => {
  it('keeps compositions independent and restores the selected version', () => {
    let state = createStoryVersionState(payload, sourceId);
    const editedSource = composition('Edited Source', 1.5, '2026-09-24T06:03:00.000Z');

    state = updateActiveStoryComposition(state, editedSource);
    state = switchStoryImageVersion(state, generatedId);
    expect(activeStoryImageVersion(state).composition).toEqual(generatedComposition);

    state = switchStoryImageVersion(state, sourceId);
    expect(activeStoryImageVersion(state).composition).toEqual(editedSource);
  });

  it('does not migrate Source composition into an empty generated version', () => {
    const state = createStoryVersionState(payload, emptyGeneratedId);
    expect(activeStoryImageVersion(state).composition).toEqual(emptyComposition);
  });

  it('deletes generated versions safely and never deletes Source', () => {
    let state = createStoryVersionState(payload, generatedId);
    state = deleteStoryGeneratedVersion(state, generatedId);

    expect(state.activeVersionId).toBe(sourceId);
    expect(state.payload.imageVersions.map((version) => version.id)).toEqual([
      sourceId,
      emptyGeneratedId,
    ]);
    expect(() => deleteStoryGeneratedVersion(state, sourceId)).toThrow(/source/i);
  });
});
