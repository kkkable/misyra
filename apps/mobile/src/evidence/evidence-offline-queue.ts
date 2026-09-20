import type { MutationQueueDatabase } from '../storage/mutation-queue.js';

export type OfflineEvidenceSubmission = Readonly<{
  mutationId: string;
  attemptId: string;
  occurrenceId: string;
  submittedAt: string;
  originalUri: string;
  thumbnailUris: readonly string[];
}>;

export type OfflineEvidencePending = OfflineEvidenceSubmission;

export type OfflineEvidenceQueueApi = Readonly<{
  reserveAttempt(
    occurrenceId: string,
    input: Readonly<{ attemptId: string; submittedAt: string }>,
  ): Promise<Readonly<{
    attemptId: string;
    occurrenceId: string;
    attemptNumber: 1 | 2 | 3;
    firstSubmittedAt: string;
    effectiveSubmittedAt: string;
    uploadPath: string;
  }>>;
  uploadOriginal(uploadPath: string, fileUri: string): Promise<void>;
  getResult(attemptId: string): Promise<Readonly<{
    verificationStatus: 'pending' | 'queued' | 'accepted' | 'rejected';
  }>>;
}>;

export type OfflineEvidenceFiles = Readonly<{
  discard(uri: string): Promise<void>;
}>;

export function createEvidenceOfflineQueue(_options: Readonly<{
  database: MutationQueueDatabase;
  accountId: string;
  deviceId: string;
  api: OfflineEvidenceQueueApi;
  files: OfflineEvidenceFiles;
}>) {
  void _options;
  return Object.freeze({
    async enqueue(_submission: OfflineEvidenceSubmission): Promise<void> {
      void _submission;
      throw new Error('MTS-083 offline evidence queue not implemented');
    },
    async getPendingForOccurrence(_occurrenceId: string): Promise<OfflineEvidencePending | null> {
      void _occurrenceId;
      throw new Error('MTS-083 offline evidence queue not implemented');
    },
    async processPending(): Promise<Readonly<{ processed: number; remaining: number }>> {
      throw new Error('MTS-083 offline evidence queue not implemented');
    },
  });
}
