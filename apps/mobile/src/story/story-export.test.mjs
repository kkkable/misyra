import { describe, expect, it, vi } from 'vitest';

import {
  createStoryExportController,
  createStoryExportDescriptor,
} from './story-export.ts';

const sourceImage = {
  id: 'source-version',
  uri: 'file:///story/source-version.jpg',
  width: 3024,
  height: 4032,
};

function composition({
  scale = 1,
  translateX = 0,
  savedAt = '2026-09-24T12:25:00.000Z',
} = {}) {
  return {
    canvas: { width: 1080, height: 1920 },
    background: {
      scale,
      translateX,
      translateY: 0,
      rotation: 0,
    },
    headline: {
      text: 'Mission complete',
      x: 120,
      y: 240,
      width: 760,
      fontSize: 80,
      fontCategory: 'system-bold',
      color: '#FFFFFF',
    },
    supportingText: null,
    effects: [{ kind: 'contrast', amount: 0.1 }],
    revision: 1,
    savedAt,
  };
}

function input(imageVersionId, overrides = {}) {
  return {
    imageVersionId,
    sourceImage: {
      ...sourceImage,
      id: imageVersionId,
      uri: `file:///story/${imageVersionId}.jpg`,
    },
    composition: composition(overrides),
  };
}

function platform() {
  const renderPng = vi.fn(async (value) => ({
    uri: `file:///story/exports/${value.imageVersionId}.png`,
    width: 1080,
    height: 1920,
    imageVersionId: value.imageVersionId,
  }));
  return {
    renderPng,
    requestSavePermission: vi.fn(async () => true),
    saveToPhotos: vi.fn(async () => undefined),
    share: vi.fn(async () => undefined),
  };
}

describe('MTS-097 Story export contract', () => {
  it('keeps a fixed 1080x1920 final render plan independent of preview width', () => {
    const descriptor = createStoryExportDescriptor(input('source-version'));

    expect(descriptor.width).toBe(1080);
    expect(descriptor.height).toBe(1920);
    expect(descriptor.scene).toMatchInlineSnapshot(`
      {
        "canvas": {
          "height": 1920,
          "width": 1080,
        },
        "nodes": [
          {
            "kind": "image",
            "sourceId": "source-version",
            "transform": {
              "rotation": 0,
              "scale": 1,
              "translateX": 0,
              "translateY": 0,
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
            "y": 240,
          },
        ],
      }
    `);
  });

  it('exports each retained Story version from that version independent composition', async () => {
    const native = platform();
    const controller = createStoryExportController(native);
    const source = input('source-version', { scale: 1.1, translateX: 40 });
    const generated = input('generated-version', { scale: 1.7, translateX: -120 });

    await controller.share(source);
    await controller.share(generated);

    expect(native.renderPng).toHaveBeenNthCalledWith(1, source);
    expect(native.renderPng).toHaveBeenNthCalledWith(2, generated);
    expect(native.share).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ imageVersionId: 'source-version', width: 1080, height: 1920 }),
    );
    expect(native.share).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ imageVersionId: 'generated-version', width: 1080, height: 1920 }),
    );
  });

  it('requests photo-save permission only after the user invokes Save to Photos and saves without a pre-confirmation step', async () => {
    const native = platform();
    const controller = createStoryExportController(native);
    const value = input('source-version');

    expect(native.requestSavePermission).not.toHaveBeenCalled();
    expect(native.renderPng).not.toHaveBeenCalled();

    await expect(controller.saveToPhotos(value)).resolves.toBe('saved');

    expect(native.requestSavePermission).toHaveBeenCalledTimes(1);
    expect(native.renderPng).toHaveBeenCalledTimes(1);
    expect(native.saveToPhotos).toHaveBeenCalledTimes(1);
  });

  it('does not render or save when photo-save permission is denied', async () => {
    const native = platform();
    native.requestSavePermission.mockResolvedValue(false);
    const controller = createStoryExportController(native);

    await expect(controller.saveToPhotos(input('source-version'))).resolves.toBe(
      'permission_denied',
    );

    expect(native.renderPng).not.toHaveBeenCalled();
    expect(native.saveToPhotos).not.toHaveBeenCalled();
  });

  it('opens system sharing from a local export without asking for photo-library permission', async () => {
    const native = platform();
    const controller = createStoryExportController(native);

    await controller.share(input('generated-version'));

    expect(native.requestSavePermission).not.toHaveBeenCalled();
    expect(native.renderPng).toHaveBeenCalledTimes(1);
    expect(native.share).toHaveBeenCalledTimes(1);
  });
});
