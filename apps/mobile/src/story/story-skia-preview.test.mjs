import { describe, expect, it } from 'vitest';

import { createStoryPreviewLayout, createStorySkiaSceneSnapshot } from './story-skia-preview.ts';

const composition = {
  canvas: { width: 1080, height: 1920 },
  background: {
    scale: 1.25,
    translateX: 80,
    translateY: -120,
    rotation: 0,
  },
  headline: {
    text: 'Mission complete',
    x: 120,
    y: 260,
    width: 760,
    fontSize: 80,
    fontCategory: 'system-bold',
    color: '#FFFFFF',
  },
  supportingText: null,
  effects: [{ kind: 'contrast', amount: 0.1 }],
  revision: 2,
  savedAt: '2026-09-23T05:49:00.000Z',
};

describe('MTS-091 Skia Story preview contract', () => {
  it.each([
    [360, 360, 640, 1 / 3],
    [412, 412, 732.4444444444445, 412 / 1080],
  ])(
    'scales the fixed canvas responsively at %ipx available width',
    (availableWidth, expectedWidth, expectedHeight, expectedScale) => {
      expect(createStoryPreviewLayout(availableWidth)).toEqual({
        canvasWidth: 1080,
        canvasHeight: 1920,
        displayWidth: expectedWidth,
        displayHeight: expectedHeight,
        scale: expectedScale,
      });
    },
  );

  it('creates a deterministic Skia scene snapshot in fixed-canvas coordinates', () => {
    expect(
      createStorySkiaSceneSnapshot({
        image: {
          id: 'source-1',
          uri: 'file:///story/source-1.jpg',
          width: 3024,
          height: 4032,
        },
        composition,
      }),
    ).toMatchInlineSnapshot(`
      {
        "canvas": {
          "height": 1920,
          "width": 1080,
        },
        "nodes": [
          {
            "kind": "image",
            "sourceId": "source-1",
            "transform": {
              "rotation": 0,
              "scale": 1.25,
              "translateX": 80,
              "translateY": -120,
            },
          },
          {
            "amount": 0.1,
            "kind": "effect",
            "name": "contrast",
          },
          {
            "color": "#FFFFFF",
            "fontCategory": "system-bold",
            "fontSize": 80,
            "kind": "text",
            "role": "headline",
            "text": "Mission complete",
            "width": 760,
            "x": 120,
            "y": 260,
          },
        ],
      }
    `);
  });
});
