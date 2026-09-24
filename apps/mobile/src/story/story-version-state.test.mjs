import { describe, expect, it } from 'vitest';

import {
  activeStoryImageVersion,
  createStoryVersionState,
  deleteStoryGeneratedVersion,
  switchStoryImageVersion,
  updateActiveStoryComposition,
} from './story-version-state.ts';

const sourceComposition = {
  canvas: { width: 1080, height: 1920 },
  background: { scale: 1, translateX: 0, translateY: 0, rotation: 0 },
  headline: {
    text: 'Source headline',
    x: 120,
    y: 260,
    width: 840,
    fontSize: 72,
    fontCategory: 'system-bold',
    color: '#FFFFFF',
  },
  supportingText: null,
  effects: [{ kind: 'contrast', amount: 0.1 }],
  revision: 2,
  savedAt: '2026-09-24T06:00:00.000Z',
};

const generatedComposition = {
  canvas: { width: 1080, height: 1920 },
  background: { scale: 1.4, translateX: 90, translateY: -40, rotation: 0.05 },
  headline: {
    text: 'AI headline',
    x: 200,
    y: 420,
    width: 700,
    fontSize: 64,
    fontCategory: 'system',
    color: '#111111',
  },
  supportingText: {
    text: 'Generated supporting text',
    x: 160,
    y: 1500,
    width: 760,
    fontSize: 40,
    fontCategory: 'system',
    color: '#FFFFFF',
  },
  effects: [{ kind: 'contrast', amount: 0.3 }],
  revision: 5,
  savedAt: '2026-09-24T06:01:00.000Z',
};

const payload = {
  draftId: '11111111-1111-4111-8111-111111111111',
  notes: { musicMood: null, mention: null, location: null, poll: null },
  imageVersions: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'source',
      storageKey: 'story/source/22222222-2222-4222-8222-222222222222',
      composition: sourceComposition,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'generated',
      storageKey: 'story/generated/33333333-3333-4333-8333-333333333333',
      composition: generatedComposition,
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'generated',
      storageKey: 'story/generated/44444444-4444-4444-8444-444444444444',
      composition: {
        ...generatedComposition,
        headline: null,
        supportingText: null,
        effects: [],
        revision: 0,
        savedAt: '2026-09-24T06:02:00.000Z',
      },
    },
  ],
};

describe('MTS-095 independent per-version composition state', () => {
  it('updates only the active version and restores every saved field when switching back', () => {
    const sourceId = payload.imageVersions[0].id;
    const generatedId = payload.imageVersions[1].id;
    let state = createStoryVersionState(payload, sourceId);

    const editedSource = {
      ...sourceComposition,
      background: { scale: 1.8, translateX: -30, translateY: 75, rotation: -0.1 },
      headline: { ...sourceComposition.headline, text: 'Edited source only', x: 360 },
      supportingText: {
        text: 'Source-only supporting copy',
        x: 140,
        y: 1480,
        width: 800,
        fontSize: 42,
        fontCategory: 'system-bold',
        color: '#FFFFFF',
      },
      effects: [{ kind: 'contrast', amount: 0.2 }, { kind: 'grain', amount: 0.4 }],
      revision: 3,
      savedAt: '2026-09-24T06:03:00.000Z',
    };

    state = updateActiveStoryComposition(state, editedSource);
    state = switchStoryImageVersion(state, generatedId);
    expect(activeStoryImageVersion(state).composition).toEqual(generatedComposition);

    const editedGenerated = {
      ...generatedComposition,
      headline: { ...generatedComposition.headline, text: 'Generated changed independently' },
      revision: 6,
      savedAt: '2026-09-24T06:04:00.000Z',
    };
    state = updateActiveStoryComposition(state, editedGenerated);
    state = switchStoryImageVersion(state, sourceId);

    expect(activeStoryImageVersion(state).composition).toEqual(editedSource);
    expect(
      state.payload.imageVersions.find((version) => version.id === generatedId)?.composition,
    ).toEqual(editedGenerated);
  });

  it('does not migrate Source composition into a generated version that starts empty', () => {
    const state = createStoryVersionState(payload, payload.imageVersions[2].id);
    const generated = activeStoryImageVersion(state);

    expect(generated.kind).toBe('generated');
    expect(generated.composition.headline).toBeNull();
    expect(generated.composition.supportingText).toBeNull();
    expect(generated.composition.effects).toEqual([]);
    expect(generated.composition.background).toEqual({
      scale: 1,
      translateX: 0,
      translateY: 0,
      rotation: 0,
    });
  });

  it('deletes only a generated version and safely falls back to Source when the active version is removed', () => {
    const sourceId = payload.imageVersions[0].id;
    const generatedId = payload.imageVersions[1].id;
    let state = createStoryVersionState(payload, generatedId);

    state = deleteStoryGeneratedVersion(state, generatedId);

    expect(state.activeVersionId).toBe(sourceId);
    expect(state.payload.imageVersions.map((version) => version.id)).toEqual([
      sourceId,
      payload.imageVersions[2].id,
    ]);
    expect(() => deleteStoryGeneratedVersion(state, sourceId)).toThrow(/source/i);
  });
});
