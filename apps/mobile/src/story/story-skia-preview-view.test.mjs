import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', async () => {
  const { createElement: h } = await import('react');
  return {
    Platform: { select: ({ ios }) => ios },
    StyleSheet: { create: (value) => value },
    View: ({ children, ...props }) => h('View', props, children),
  };
});

vi.mock('@shopify/react-native-skia', async () => {
  const { createElement: h } = await import('react');
  const host = (name) => ({ children, ...props }) => h(name, props, children);
  return {
    Canvas: host('SkiaCanvas'),
    ColorMatrix: host('SkiaColorMatrix'),
    Group: host('SkiaGroup'),
    Image: host('SkiaImage'),
    Text: host('SkiaText'),
    matchFont: vi.fn((style) => ({ style })),
    useImage: vi.fn(() => ({ id: 'decoded-image' })),
  };
});

import { StorySkiaPreviewView } from './story-skia-preview-view.tsx';

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

describe('MTS-091 rendered Skia Story preview', () => {
  it('scales the fixed canvas while keeping composition coordinates inside the Skia scene', () => {
    let renderer;
    act(() => {
      renderer = create(
        createElement(StorySkiaPreviewView, {
          availableWidth: 360,
          composition,
          sourceImage: {
            id: 'source-1',
            uri: 'file:///story/source-1.jpg',
            width: 3024,
            height: 4032,
          },
        }),
      );
    });

    expect(renderer.toJSON()).toMatchInlineSnapshot(`
      <View
        style={
          {
            "height": 640,
            "overflow": "hidden",
            "width": 360,
          }
        }
      >
        <SkiaCanvas
          style={
            {
              "height": 640,
              "width": 360,
            }
          }
        >
          <SkiaGroup
            transform={
              [
                {
                  "scale": 0.3333333333333333,
                },
              ]
            }
          >
            <SkiaGroup
              origin={
                {
                  "x": 540,
                  "y": 960,
                }
              }
              transform={
                [
                  {
                    "translateX": 80,
                  },
                  {
                    "translateY": -120,
                  },
                  {
                    "scale": 1.25,
                  },
                  {
                    "rotate": 0,
                  },
                ]
              }
            >
              <SkiaImage
                fit="cover"
                height={1920}
                image={
                  {
                    "id": "decoded-image",
                  }
                }
                width={1080}
                x={0}
                y={0}
              >
                <SkiaColorMatrix
                  matrix={
                    [
                      1.1,
                      0,
                      0,
                      0,
                      -12.800000000000011,
                      0,
                      1.1,
                      0,
                      0,
                      -12.800000000000011,
                      0,
                      0,
                      1.1,
                      0,
                      -12.800000000000011,
                      0,
                      0,
                      0,
                      1,
                      0,
                    ]
                  }
                />
              </SkiaImage>
            </SkiaGroup>
            <SkiaText
              color="#FFFFFF"
              font={
                {
                  "style": {
                    "fontFamily": "Helvetica",
                    "fontSize": 80,
                    "fontWeight": "bold",
                  },
                }
              }
              text="Mission complete"
              x={120}
              y={340}
            />
          </SkiaGroup>
        </SkiaCanvas>
      </View>
    `);
  });
});
