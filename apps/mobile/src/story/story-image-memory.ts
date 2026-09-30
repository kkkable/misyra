export const STORY_PREVIEW_MAX_WIDTH = 1080;
export const STORY_PREVIEW_MAX_HEIGHT = 1920;

function assertDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('story_image_dimension_invalid');
  }
  return value;
}

export function resolveStoryPreviewDimensions(
  width: number,
  height: number,
): Readonly<{ width: number; height: number }> {
  const sourceWidth = assertDimension(width);
  const sourceHeight = assertDimension(height);
  const scale = Math.min(
    1,
    STORY_PREVIEW_MAX_WIDTH / sourceWidth,
    STORY_PREVIEW_MAX_HEIGHT / sourceHeight,
  );
  return Object.freeze({
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  });
}

export function estimateRgbaImageBytes(width: number, height: number): number {
  return Math.ceil(assertDimension(width)) * Math.ceil(assertDimension(height)) * 4;
}
