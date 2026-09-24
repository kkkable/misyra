import { createElement } from 'react';

import {
  ImageFormat,
  Skia,
  drawAsImage,
} from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { shareAsync } from 'expo-sharing';

import {
  STORY_EXPORT_HEIGHT,
  STORY_EXPORT_WIDTH,
  type StoryExportArtifact,
  type StoryExportInput,
  type StoryExportPlatform,
} from './story-export.js';
import { StorySkiaScene } from './story-skia-scene.js';

const STORY_EXPORT_DIRECTORY = `${FileSystem.cacheDirectory ?? ''}misyra/story-exports/`;

function requireExportDirectory(): string {
  if (FileSystem.cacheDirectory === null) {
    throw new Error('story_export_cache_unavailable');
  }
  return STORY_EXPORT_DIRECTORY;
}

async function renderStoryPng(input: StoryExportInput): Promise<StoryExportArtifact> {
  const data = await Skia.Data.fromURI(input.sourceImage.uri);
  const sourceImage = Skia.Image.MakeImageFromEncoded(data);
  if (sourceImage === null) {
    throw new Error('story_export_source_decode_failed');
  }

  const image = await drawAsImage(
    createElement(StorySkiaScene, {
      composition: input.composition,
      image: sourceImage,
    }),
    {
      width: STORY_EXPORT_WIDTH,
      height: STORY_EXPORT_HEIGHT,
    },
  );
  if (image === null) {
    throw new Error('story_export_render_failed');
  }
  if (image.width() !== STORY_EXPORT_WIDTH || image.height() !== STORY_EXPORT_HEIGHT) {
    throw new Error('story_export_dimensions_invalid');
  }

  const directory = requireExportDirectory();
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const safeVersionId = input.imageVersionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const uri = `${directory}story-${safeVersionId}-${Date.now()}.png`;
  const base64 = image.encodeToBase64(ImageFormat.PNG, 100);
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    uri,
    width: STORY_EXPORT_WIDTH,
    height: STORY_EXPORT_HEIGHT,
    imageVersionId: input.imageVersionId,
  };
}

async function removeExportFile(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

export function createExpoStoryExportPlatform(): StoryExportPlatform {
  return Object.freeze({
    renderPng: renderStoryPng,

    async requestSavePermission(): Promise<boolean> {
      const response = await requestPermissionsAsync(true, []);
      return response.granted;
    },

    async saveToPhotos(artifact: StoryExportArtifact): Promise<void> {
      try {
        await Asset.create(artifact.uri);
      } finally {
        await removeExportFile(artifact.uri);
      }
    },

    async share(artifact: StoryExportArtifact): Promise<void> {
      try {
        await shareAsync(artifact.uri, {
          UTI: 'public.png',
          mimeType: 'image/png',
        });
      } finally {
        await removeExportFile(artifact.uri);
      }
    },
  });
}
