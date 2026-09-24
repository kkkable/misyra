import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';

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
    Image.getSize(
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

export async function loadExpoStoryWorkingCopy(
  imageVersionId: string,
): Promise<Readonly<{ id: string; uri: string; width: number; height: number }>> {
  const uri = storyWorkingCopyUri(imageVersionId);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('story_working_copy_unavailable');
  }
  const size = await dimensions(uri);
  return { id: imageVersionId, uri, width: size.width, height: size.height };
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
      const size = await dimensions(response.uri);
      return { uri: response.uri, width: size.width, height: size.height };
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
      const size = await dimensions(response.uri);
      return {
        id: imageVersionId,
        uri: response.uri,
        width: size.width,
        height: size.height,
      };
    },

    async delete(imageVersionId: string) {
      await FileSystem.deleteAsync(storyWorkingCopyUri(imageVersionId), { idempotent: true });
    },
  });
}

export type ExpoStoryVersionFiles = ReturnType<typeof createExpoStoryVersionFiles>;
