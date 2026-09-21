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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageRoot(kind: 'evidence-working' | 'evidence-save'): string {
  const root =
    kind === 'evidence-working' ? FileSystem.documentDirectory : FileSystem.cacheDirectory;
  if (root === null) throw new Error('Evidence media storage is unavailable.');
  return `${root}misyra/${kind}/`;
}

function validateAttemptId(attemptId: string): void {
  if (!UUID_PATTERN.test(attemptId)) {
    throw new Error('Invalid evidence attempt identifier.');
  }
}

function attemptDirectory(attemptId: string): string {
  validateAttemptId(attemptId);
  return `${storageRoot('evidence-working')}${attemptId}/`;
}

function saveDownloadPath(attemptId: string): string {
  validateAttemptId(attemptId);
  return `${storageRoot('evidence-save')}${attemptId}.jpg`;
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

export function createExpoEvidenceMediaActionsRuntime(options: RuntimeOptions): Readonly<{
  api: EvidenceMediaActionsApi;
  photoLibrary: EvidencePhotoLibrary;
  files: EvidenceMediaFiles;
}> {
  const root = options.baseUrl.endsWith('/') ? options.baseUrl.slice(0, -1) : options.baseUrl;
  const authorization = `Bearer ${options.accessToken}`;

  return {
    api: {
      async downloadOriginal(attemptId) {
        validateAttemptId(attemptId);
        const directory = storageRoot('evidence-save');
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        const destination = saveDownloadPath(attemptId);
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
        const response = await requestPermissionsAsync(true, []);
        return response.granted ? 'granted' : 'denied';
      },

      async saveToPhotos(fileUri) {
        await Asset.create(fileUri);
      },
    },

    files: {
      discard(uri) {
        return FileSystem.deleteAsync(uri, { idempotent: true });
      },
      async deleteAttemptCopies(attemptId) {
        await FileSystem.deleteAsync(attemptDirectory(attemptId), { idempotent: true });
        await FileSystem.deleteAsync(saveDownloadPath(attemptId), { idempotent: true });
      },
    },
  };
}
