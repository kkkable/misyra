import { storyCompositionSchema } from '@misyra/contracts';

export type StoryCanvas = Readonly<{ width: 1080; height: 1920 }>;

export type StoryBackgroundTransform = Readonly<{
  scale: number;
  translateX: number;
  translateY: number;
  rotation: number;
}>;

export type StoryTextLayer = Readonly<
  {
    text: string;
    x: number;
    y: number;
    width: number;
    fontSize: number;
    fontCategory: string;
    color: string;
  } & Record<string, unknown>
>;

export type StoryEffect = Readonly<
  {
    kind: string;
    amount?: number;
  } & Record<string, unknown>
>;

export type StoryComposition = Readonly<{
  canvas: StoryCanvas;
  background: StoryBackgroundTransform;
  headline: StoryTextLayer | null;
  supportingText: StoryTextLayer | null;
  effects: readonly StoryEffect[];
  revision: number;
  savedAt: string;
}>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function textLayer(value: unknown, label: string): StoryTextLayer | null {
  if (value === null) return null;
  const source = record(value, label);
  const normalized = {
    ...source,
    text: nonEmptyString(source.text, `${label} text`),
    x: finiteNumber(source.x, `${label} x`),
    y: finiteNumber(source.y, `${label} y`),
    width: finiteNumber(source.width, `${label} width`),
    fontSize: finiteNumber(source.fontSize, `${label} font size`),
    fontCategory: nonEmptyString(source.fontCategory, `${label} font category`),
    color: nonEmptyString(source.color, `${label} color`),
  };
  if (normalized.width <= 0 || normalized.fontSize <= 0) {
    throw new RangeError(`${label} width and font size must be positive.`);
  }
  return Object.freeze(normalized);
}

function effect(value: unknown, index: number): StoryEffect {
  const source = record(value, `Story effect ${String(index)}`);
  const kind = nonEmptyString(source.kind, `Story effect ${String(index)} kind`);
  if (source.amount !== undefined) {
    finiteNumber(source.amount, `Story effect ${String(index)} amount`);
  }
  return Object.freeze({ ...source, kind }) as StoryEffect;
}

export function validateStoryComposition(value: unknown): StoryComposition {
  const parsed = storyCompositionSchema.parse(value);
  return Object.freeze({
    canvas: Object.freeze({ width: 1080 as const, height: 1920 as const }),
    background: Object.freeze({
      scale: parsed.background.scale,
      translateX: parsed.background.translateX,
      translateY: parsed.background.translateY,
      rotation: parsed.background.rotation,
    }),
    headline: textLayer(parsed.headline, 'Story headline'),
    supportingText: textLayer(parsed.supportingText, 'Story supporting text'),
    effects: Object.freeze(parsed.effects.map(effect)),
    revision: parsed.revision,
    savedAt: parsed.savedAt,
  });
}

export function serializeStoryComposition(value: unknown): string {
  return JSON.stringify(validateStoryComposition(value));
}

export function parseStoryComposition(source: string): StoryComposition {
  return validateStoryComposition(JSON.parse(source) as unknown);
}

export function cloneStoryComposition(value: StoryComposition): StoryComposition {
  return parseStoryComposition(serializeStoryComposition(value));
}

export function createEmptyStoryComposition(savedAt: string): StoryComposition {
  return validateStoryComposition({
    canvas: { width: 1080, height: 1920 },
    background: { scale: 1, translateX: 0, translateY: 0, rotation: 0 },
    headline: null,
    supportingText: null,
    effects: [],
    revision: 0,
    savedAt,
  });
}
