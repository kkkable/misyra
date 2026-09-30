import { createElement } from 'react';

import { Image as SkiaImage, ImageFormat, Skia, drawAsImage } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as NativeImage } from 'react-native';

import { resolveStoryPreviewDimensions } from './story-image-memory.js';
import type { StorySourceFiles } from './story-source-runtime.js';

export function storyWorkingDirectory(): string {
  const root = FileSystem.documentDirectory;
  if (root === null) {
    throw new Error('Protected app document storage is unavailable.');
  }
  return `${root}misyra/story-working/`;
}

function dimensions(uri: string): Promise<Readonly<{ width: number; height: number }>> {
  return new Promise((resolve, reject) => {
    NativeImage.getSize(
      uri,
      (width, height) => {
        resolve({ width, height });
      },
      (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export function storyWorkingCopyUri(imageVersionId: string): string {
  return `${storyWorkingDirectory()}${imageVersionId}.jpg`;
}

export function storyPreviewWorkingCopyUri(imageVersionId: string): string {
  return `${storyWorkingDirectory()}${imageVersionId}.preview.png`;
}

async function materializePreviewResource(
  imageVersionId: string,
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
): Promise<string> {
  const target = resolveStoryPreviewDimensions(sourceWidth, sourceHeight);
  if (target.width === sourceWidth && target.height === sourceHeight) {
    return sourceUri;
  }

  const previewUri = storyPreviewWorkingCopyUri(imageVersionId);
  const existing = await FileSystem.getInfoAsync(previewUri);
  if (existing.exists) return previewUri;

  const data = await Skia.Data.fromURI(sourceUri);
  const sourceImage = Skia.Image.MakeImageFromEncoded(data);
  if (sourceImage === null) {
    throw new Error('story_preview_source_decode_failed');
  }

  const preview = await drawAsImage(
    createElement(SkiaImage, {
      image: sourceImage,
      x: 0,
      y: 0,
      width: target.width,
      height: target.height,
      fit: 'fill',
    }),
    target,
  );
  if (preview === null) {
    throw new Error('story_preview_render_failed');
  }

  const base64 = preview.encodeToBase64(ImageFormat.PNG, 100);
  await FileSystem.writeAsStringAsync(previewUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return previewUri;
}

async function describeStoryWorkingCopy(
  imageVersionId: string,
  uri: string,
): Promise<
  Readonly<{ id: string; uri: string; previewUri: string; width: number; height: number }>
> {
  const size = await dimensions(uri);
  const previewUri = await materializePreviewResource(imageVersionId, uri, size.width, size.height);
  return {
    id: imageVersionId,
    uri,
    previewUri,
    width: size.width,
    height: size.height,
  };
}

const STORY_FILE_RETENTION_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

export async function pruneExpiredStoryWorkingFiles(
  now: () => Date = () => new Date(),
): Promise<number> {
  const directory = storyWorkingDirectory();
  const directoryInfo = await FileSystem.getInfoAsync(directory);
  if (!directoryInfo.exists) return 0;

  const cutoff = now().getTime() - STORY_FILE_RETENTION_MILLISECONDS;
  const names = await FileSystem.readDirectoryAsync(directory);
  let deleted = 0;
  for (const name of names) {
    const uri = `${directory}${name}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) continue;
    const modifiedAt =
      'modificationTime' in info && typeof info.modificationTime === 'number'
        ? info.modificationTime * 1000
        : null;
    if (modifiedAt === null || modifiedAt > cutoff) continue;
    await FileSystem.deleteAsync(uri, { idempotent: true });
    deleted += 1;
  }
  return deleted;
}

export async function loadExpoStoryWorkingCopy(imageVersionId: string) {
  const uri = storyWorkingCopyUri(imageVersionId);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('story_working_copy_unavailable');
  }
  return describeStoryWorkingCopy(imageVersionId, uri);
}

export function createExpoStorySourceFiles(
  input: Readonly<{
    baseUrl: string;
    accessToken: string;
  }>,
): StorySourceFiles {
  const root = input.baseUrl.endsWith('/') ? input.baseUrl.slice(0, -1) : input.baseUrl;

  return Object.freeze({
    async copyOriginalToStoryWorking(attemptId: string, imageVersionId: string) {
      const directory = storyWorkingDirectory();
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const destination = `${directory}${imageVersionId}.jpg`;
      const response = await FileSystem.downloadAsync(
        `${root}/v1/evidence/attempts/${encodeURIComponent(attemptId)}/media/original`,
        destination,
        {
          headers: { authorization: `Bearer ${input.accessToken}` },
        },
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error('story_source_download_failed');
      }
      const described = await describeStoryWorkingCopy(imageVersionId, response.uri);
      return {
        uri: described.uri,
        previewUri: described.previewUri,
        width: described.width,
        height: described.height,
      };
    },
  });
}

export function createExpoStoryVersionFiles(
  input: Readonly<{
    baseUrl: string;
    accessToken: string;
  }>,
) {
  const root = input.baseUrl.endsWith('/') ? input.baseUrl.slice(0, -1) : input.baseUrl;

  return Object.freeze({
    load(imageVersionId: string) {
      return loadExpoStoryWorkingCopy(imageVersionId);
    },

    async materializeGenerated(draftId: string, imageVersionId: string) {
      const directory = storyWorkingDirectory();
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const destination = storyWorkingCopyUri(imageVersionId);
      const response = await FileSystem.downloadAsync(
        `${root}/v1/stories/${encodeURIComponent(draftId)}/image-versions/${encodeURIComponent(imageVersionId)}/media`,
        destination,
        {
          headers: { authorization: `Bearer ${input.accessToken}` },
        },
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error('story_generated_download_failed');
      }
      return describeStoryWorkingCopy(imageVersionId, response.uri);
    },

    async delete(imageVersionId: string) {
      await Promise.all([
        FileSystem.deleteAsync(storyWorkingCopyUri(imageVersionId), { idempotent: true }),
        FileSystem.deleteAsync(storyPreviewWorkingCopyUri(imageVersionId), { idempotent: true }),
      ]);
    },
  });
}

export type ExpoStoryVersionFiles = ReturnType<typeof createExpoStoryVersionFiles>;
