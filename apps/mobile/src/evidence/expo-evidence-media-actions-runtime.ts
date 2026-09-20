import * as FileSystem from 'expo-file-system/legacy';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

import type {
  EvidenceMediaActionsApi,
  EvidenceMediaFiles,
  EvidencePhotoLibrary,
} from './evidence-media-actions.js';

type RuntimeOptions = Readonly<{
  baseUrl: string;
  accessToken: string;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageRoot(kind: 'evidence-working' | 'evidence-save'): string {
  const root =
    kind === 'evidence-working' ? FileSystem.documentDirectory : FileSystem.cacheDirectory;
  if (root === null) throw new Error('Evidence media storage is unavailable.');
  return `${root}misyra/${kind}/`;
}

function attemptDirectory(attemptId: string): string {
  if (!UUID_PATTERN.test(attemptId)) {
    throw new Error('Invalid evidence attempt identifier.');
  }
  return `${storageRoot('evidence-working')}${attemptId}/`;
}

export async function bindEvidenceOriginalToAttempt(
  attemptId: string,
  sourceUri: string,
): Promise<string> {
  const directory = attemptDirectory(attemptId);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}original.jpg`;
  if (sourceUri !== destination) {
    await FileSystem.moveAsync({ from: sourceUri, to: destination });
  }
  return destination;
}

export function createExpoEvidenceMediaActionsRuntime(
  options: RuntimeOptions,
): Readonly<{
  api: EvidenceMediaActionsApi;
  photoLibrary: EvidencePhotoLibrary;
  files: EvidenceMediaFiles;
}> {
  const root = options.baseUrl.endsWith('/') ? options.baseUrl.slice(0, -1) : options.baseUrl;
  const authorization = `Bearer ${options.accessToken}`;

  return {
    api: {
      async downloadOriginal(attemptId) {
        if (!UUID_PATTERN.test(attemptId)) {
          throw new Error('Invalid evidence attempt identifier.');
        }
        const directory = storageRoot('evidence-save');
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        const destination = `${directory}${attemptId}.jpg`;
        await FileSystem.deleteAsync(destination, { idempotent: true });
        const response = await FileSystem.downloadAsync(
          `${root}/v1/evidence/attempts/${encodeURIComponent(attemptId)}/media/original`,
          destination,
          { headers: { authorization } },
        );
        if (response.status !== 200) {
          await FileSystem.deleteAsync(destination, { idempotent: true });
          throw new Error('evidence_media_download_failed');
        }
        return destination;
      },

      async deleteMedia(attemptId) {
        const response = await fetch(
          `${root}/v1/evidence/attempts/${encodeURIComponent(attemptId)}/media`,
          {
            method: 'DELETE',
            headers: { authorization },
          },
        );
        if (!response.ok) throw new Error('evidence_media_delete_failed');
        await response.json();
      },
    },

    photoLibrary: {
      async requestSavePermission() {
        const response = await requestPermissionsAsync(true, ['photo']);
        return response.status === 'granted' ? 'granted' : 'denied';
      },

      async saveToPhotos(fileUri) {
        await Asset.create(fileUri);
      },
    },

    files: {
      discard(uri) {
        return FileSystem.deleteAsync(uri, { idempotent: true });
      },
      deleteAttemptCopies(attemptId) {
        return FileSystem.deleteAsync(attemptDirectory(attemptId), { idempotent: true });
      },
    },
  };
}
