import { describe, expect, it } from 'vitest';

import {
  STORY_PREVIEW_MAX_HEIGHT,
  STORY_PREVIEW_MAX_WIDTH,
  estimateRgbaImageBytes,
  resolveStoryPreviewDimensions,
} from './story-image-memory.js';

describe('MTS-112 Story image-memory budget', () => {
  it('bounds a large camera source to the approved Story canvas envelope without changing aspect ratio', () => {
    expect(STORY_PREVIEW_MAX_WIDTH).toBe(1080);
    expect(STORY_PREVIEW_MAX_HEIGHT).toBe(1920);
    expect(resolveStoryPreviewDimensions(3024, 4032)).toEqual({
      width: 1080,
      height: 1440,
    });
  });

  it('does not upscale sources already inside the preview envelope', () => {
    expect(resolveStoryPreviewDimensions(800, 600)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('keeps decoded preview memory below the same source decoded at full camera resolution', () => {
    const originalBytes = estimateRgbaImageBytes(3024, 4032);
    const preview = resolveStoryPreviewDimensions(3024, 4032);
    const previewBytes = estimateRgbaImageBytes(preview.width, preview.height);

    expect(previewBytes).toBeLessThan(originalBytes);
    expect(previewBytes).toBeLessThanOrEqual(
      STORY_PREVIEW_MAX_WIDTH * STORY_PREVIEW_MAX_HEIGHT * 4,
    );
  });
});
