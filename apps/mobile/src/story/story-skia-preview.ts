import type {
  StoryComposition,
  StoryEffect,
  StoryTextLayer,
} from './story-composition.js';
import type { StorySourceImage } from './story-editor-state.js';

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

export type StoryPreviewLayout = Readonly<{
  canvasWidth: 1080;
  canvasHeight: 1920;
  displayWidth: number;
  displayHeight: number;
  scale: number;
}>;

export function createStoryPreviewLayout(availableWidth: number): StoryPreviewLayout {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) {
    throw new RangeError('Story preview width must be positive.');
  }
  const scale = availableWidth / CANVAS_WIDTH;
  return Object.freeze({
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    displayWidth: availableWidth,
    displayHeight: availableWidth * (CANVAS_HEIGHT / CANVAS_WIDTH),
    scale,
  });
}

function effectNode(effect: StoryEffect) {
  const { kind: name, ...parameters } = effect;
  return Object.freeze({ ...parameters, kind: 'effect' as const, name });
}

function textNode(role: 'headline' | 'supportingText', layer: StoryTextLayer) {
  return Object.freeze({
    color: layer.color,
    fontCategory: layer.fontCategory,
    fontSize: layer.fontSize,
    kind: 'text' as const,
    role,
    text: layer.text,
    width: layer.width,
    x: layer.x,
    y: layer.y,
  });
}

export function createStorySkiaSceneSnapshot(input: Readonly<{
  image: StorySourceImage;
  composition: StoryComposition;
}>) {
  const nodes: object[] = [
    Object.freeze({
      kind: 'image' as const,
      sourceId: input.image.id,
      transform: Object.freeze({
        rotation: input.composition.background.rotation,
        scale: input.composition.background.scale,
        translateX: input.composition.background.translateX,
        translateY: input.composition.background.translateY,
      }),
    }),
    ...input.composition.effects.map(effectNode),
  ];

  if (input.composition.headline !== null) {
    nodes.push(textNode('headline', input.composition.headline));
  }
  if (input.composition.supportingText !== null) {
    nodes.push(textNode('supportingText', input.composition.supportingText));
  }

  return Object.freeze({
    canvas: Object.freeze({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }),
    nodes: Object.freeze(nodes),
  });
}
