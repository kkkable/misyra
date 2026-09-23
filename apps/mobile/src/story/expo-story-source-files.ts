import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';

import type { StorySourceFiles } from './story-source-runtime.js';

function storyWorkingDirectory(): string {
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
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });
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
