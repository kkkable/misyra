export type EvidenceMediaActionsApi = Readonly<{
  downloadOriginal(attemptId: string): Promise<string>;
  deleteMedia(attemptId: string): Promise<void>;
}>;

export type EvidencePhotoLibrary = Readonly<{
  requestSavePermission(): Promise<'granted' | 'denied'>;
  saveToPhotos(fileUri: string): Promise<void>;
}>;

export type EvidenceMediaFiles = Readonly<{
  discard(uri: string): Promise<void>;
  deleteAttemptCopies(attemptId: string): Promise<void>;
}>;

export function createEvidenceMediaActions(
  input: Readonly<{
    api: EvidenceMediaActionsApi;
    photoLibrary: EvidencePhotoLibrary;
    files: EvidenceMediaFiles;
  }>,
) {
  return Object.freeze({
    async saveToPhotos(attemptId: string): Promise<Readonly<{ saved: boolean }>> {
      const permission = await input.photoLibrary.requestSavePermission();
      if (permission !== 'granted') return { saved: false };

      const fileUri = await input.api.downloadOriginal(attemptId);
      try {
        await input.photoLibrary.saveToPhotos(fileUri);
        return { saved: true };
      } finally {
        await input.files.discard(fileUri);
      }
    },

    async deleteEvidence(attemptId: string): Promise<void> {
      await input.files.deleteAttemptCopies(attemptId);
      await input.api.deleteMedia(attemptId);
    },
  });
}
