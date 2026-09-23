import { describe, expect, it } from 'vitest';

import { parseStoryComposition, serializeStoryComposition } from './story-composition.ts';

const validComposition = {
  canvas: { width: 1080, height: 1920 },
  background: {
    scale: 1.1,
    translateX: 48,
    translateY: -72,
    rotation: 0,
  },
  headline: {
    text: 'Done',
    x: 96,
    y: 224,
    width: 700,
    fontSize: 84,
    fontCategory: 'system-bold',
    color: '#FFFFFF',
  },
  supportingText: null,
  effects: [{ kind: 'contrast', amount: 0.15 }],
  revision: 4,
  savedAt: '2026-09-23T05:48:00.000Z',
};

describe('MTS-091 Story composition serialization', () => {
  it('round-trips the fixed-canvas composition without sharing mutable state', () => {
    const serialized = serializeStoryComposition(validComposition);
    const parsed = parseStoryComposition(serialized);

    expect(JSON.parse(serialized)).toEqual(validComposition);
    expect(parsed).toEqual(validComposition);
    expect(parsed).not.toBe(validComposition);
    expect(parsed.background).not.toBe(validComposition.background);
    expect(parsed.effects).not.toBe(validComposition.effects);
  });

  it('rejects non-Story canvas dimensions and unsupported editor data', () => {
    expect(() =>
      serializeStoryComposition({
        ...validComposition,
        canvas: { width: 720, height: 1280 },
      }),
    ).toThrow(/1080.*1920|canvas/i);

    expect(() =>
      parseStoryComposition(
        JSON.stringify({
          ...validComposition,
          extraEditorState: { unsupported: true },
        }),
      ),
    ).toThrow(/unrecognized|unknown|unsupported/i);
  });
});
