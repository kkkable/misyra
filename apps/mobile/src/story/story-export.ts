import type { StoryComposition } from './story-composition.js';
import type { StorySourceImage } from './story-editor-state.js';
import { createStorySkiaSceneSnapshot } from './story-skia-preview.js';

export type StoryExportInput = Readonly<{
  imageVersionId: string;
  sourceImage: StorySourceImage;
  composition: StoryComposition;
}>;

export type StoryExportDescriptor = Readonly<{
  width: number;
  height: number;
  imageVersionId: string;
  scene: ReturnType<typeof createStorySkiaSceneSnapshot>;
}>;

export type StoryExportArtifact = Readonly<{
  uri: string;
  width: number;
  height: number;
  imageVersionId: string;
}>;

export type StoryExportPlatform = Readonly<{
  renderPng: (input: StoryExportInput) => Promise<StoryExportArtifact>;
  requestSavePermission: () => Promise<boolean>;
  saveToPhotos: (artifact: StoryExportArtifact) => Promise<void>;
  share: (artifact: StoryExportArtifact) => Promise<void>;
}>;

export function createStoryExportDescriptor(input: StoryExportInput): StoryExportDescriptor {
  return Object.freeze({
    width: 0,
    height: 0,
    imageVersionId: input.imageVersionId,
    scene: createStorySkiaSceneSnapshot({
      image: input.sourceImage,
      composition: input.composition,
    }),
  });
}

export function createStoryExportController(platform: StoryExportPlatform) {
  return Object.freeze({
    async saveToPhotos(_input: StoryExportInput): Promise<'saved' | 'permission_denied'> {
      throw new Error('story_export_not_implemented');
    },

    async share(_input: StoryExportInput): Promise<void> {
      throw new Error('story_export_not_implemented');
    },
  });
}
