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

export function createEvidenceMediaActions(_input: Readonly<{
  api: EvidenceMediaActionsApi;
  photoLibrary: EvidencePhotoLibrary;
  files: EvidenceMediaFiles;
}>) {
  void _input;
  return Object.freeze({
    saveToPhotos(_attemptId: string): Promise<Readonly<{ saved: boolean }>> {
      void _attemptId;
      return Promise.reject(new Error('MTS-084 evidence save not implemented'));
    },
    deleteEvidence(_attemptId: string): Promise<void> {
      void _attemptId;
      return Promise.reject(new Error('MTS-084 evidence deletion not implemented'));
    },
  });
}
