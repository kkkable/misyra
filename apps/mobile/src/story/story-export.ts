import type { StoryComposition } from './story-composition.js';
import type { StorySourceImage } from './story-editor-state.js';
import { createStorySkiaSceneSnapshot } from './story-skia-preview.js';

export const STORY_EXPORT_WIDTH = 1080;
export const STORY_EXPORT_HEIGHT = 1920;

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
    width: STORY_EXPORT_WIDTH,
    height: STORY_EXPORT_HEIGHT,
    imageVersionId: input.imageVersionId,
    scene: createStorySkiaSceneSnapshot({
      image: input.sourceImage,
      composition: input.composition,
    }),
  });
}

function assertFinalArtifact(
  input: StoryExportInput,
  artifact: StoryExportArtifact,
): StoryExportArtifact {
  if (artifact.width !== STORY_EXPORT_WIDTH || artifact.height !== STORY_EXPORT_HEIGHT) {
    throw new Error('story_export_dimensions_invalid');
  }
  if (artifact.imageVersionId !== input.imageVersionId) {
    throw new Error('story_export_version_mismatch');
  }
  return artifact;
}

export function createStoryExportController(platform: StoryExportPlatform) {
  async function render(input: StoryExportInput): Promise<StoryExportArtifact> {
    return assertFinalArtifact(input, await platform.renderPng(input));
  }

  return Object.freeze({
    async saveToPhotos(input: StoryExportInput): Promise<'saved' | 'permission_denied'> {
      const permissionGranted = await platform.requestSavePermission();
      if (!permissionGranted) return 'permission_denied';

      const artifact = await render(input);
      await platform.saveToPhotos(artifact);
      return 'saved';
    },

    async share(input: StoryExportInput): Promise<void> {
      const artifact = await render(input);
      await platform.share(artifact);
    },
  });
}
