import {
  createMutationQueue,
  type MutationQueueDatabase,
  type PendingMutation,
} from '../storage/mutation-queue.js';

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
  ): Promise<
    Readonly<{
      attemptId: string;
      occurrenceId: string;
      attemptNumber: 1 | 2 | 3;
      firstSubmittedAt: string;
      effectiveSubmittedAt: string;
      uploadPath: string;
    }>
  >;
  uploadOriginal(uploadPath: string, fileUri: string): Promise<void>;
  getResult(attemptId: string): Promise<
    Readonly<{
      verificationStatus: 'pending' | 'queued' | 'accepted' | 'rejected';
      duplicateLoser?: boolean;
    }>
  >;
}>;

export type OfflineEvidenceFiles = Readonly<{
  discard(uri: string): Promise<void>;
}>;

type OfflineEvidencePayload = Readonly<{
  attemptId: string;
  originalUri: string;
  thumbnailUris: readonly string[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.some((item) => nonEmptyString(item) === null)) return null;
  return value as readonly string[];
}

function parseEvidencePending(pending: PendingMutation): OfflineEvidencePending | null {
  if (
    pending.destination.kind !== 'evidence_upload' ||
    pending.mutation.entityType !== 'evidence' ||
    pending.mutation.operation !== 'submit'
  ) {
    return null;
  }
  const payload = pending.mutation.payload;
  if (!isRecord(payload)) throw new Error('Stored offline evidence payload is invalid.');
  const attemptId = nonEmptyString(payload.attemptId);
  const originalUri = nonEmptyString(payload.originalUri);
  const thumbnailUris = parseStringArray(payload.thumbnailUris);
  if (attemptId === null || originalUri === null || thumbnailUris === null) {
    throw new Error('Stored offline evidence payload is invalid.');
  }
  return {
    mutationId: pending.mutation.mutationId,
    attemptId,
    occurrenceId: pending.mutation.entityId,
    submittedAt: pending.mutation.clientOccurredAt,
    originalUri,
    thumbnailUris,
  };
}

function errorCode(error: unknown): string | null {
  if (!isRecord(error)) return null;
  return nonEmptyString(error.code);
}

async function discardSubmission(
  submission: OfflineEvidenceSubmission,
  files: OfflineEvidenceFiles,
): Promise<void> {
  await files.discard(submission.originalUri);
  for (const thumbnailUri of submission.thumbnailUris) {
    await files.discard(thumbnailUri);
  }
}

export function createEvidenceOfflineQueue(
  options: Readonly<{
    database: MutationQueueDatabase;
    accountId: string;
    deviceId: string;
    api: OfflineEvidenceQueueApi;
    files: OfflineEvidenceFiles;
  }>,
) {
  const queue = createMutationQueue(options.database, options.accountId);

  const evidencePending = async (): Promise<
    ReadonlyArray<Readonly<{ pending: PendingMutation; submission: OfflineEvidencePending }>>
  > => {
    const items = await queue.listPending();
    return items.flatMap((pending) => {
      const submission = parseEvidencePending(pending);
      return submission === null ? [] : [{ pending, submission }];
    });
  };

  return Object.freeze({
    enqueue(submission: OfflineEvidenceSubmission): Promise<void> {
      const payload: OfflineEvidencePayload = {
        attemptId: submission.attemptId,
        originalUri: submission.originalUri,
        thumbnailUris: [...submission.thumbnailUris],
      };
      return queue.enqueue({
        mutation: {
          mutationId: submission.mutationId,
          accountId: options.accountId,
          deviceId: options.deviceId,
          entityType: 'evidence',
          entityId: submission.occurrenceId,
          operation: 'submit',
          baseVersion: null,
          clientOccurredAt: submission.submittedAt,
          payload,
        },
        destination: { kind: 'evidence_upload' },
        applyLocal: () => Promise.resolve(),
      });
    },

    async getPendingForOccurrence(
      occurrenceId: string,
    ): Promise<OfflineEvidencePending | null> {
      const items = await evidencePending();
      return items.find((item) => item.submission.occurrenceId === occurrenceId)?.submission ?? null;
    },

    async processPending(): Promise<Readonly<{ processed: number; remaining: number }>> {
      const items = await evidencePending();
      let processed = 0;

      for (const { pending, submission } of items) {
        try {
          const reservation = await options.api.reserveAttempt(submission.occurrenceId, {
            attemptId: submission.attemptId,
            submittedAt: submission.submittedAt,
          });
          await options.api.uploadOriginal(reservation.uploadPath, submission.originalUri);
          const result = await options.api.getResult(submission.attemptId);
          if (result.verificationStatus === 'pending' || result.verificationStatus === 'queued') {
            continue;
          }
          if (result.duplicateLoser === true) {
            await discardSubmission(submission, options.files);
          }
          await queue.settle(pending.mutation.mutationId);
          processed += 1;
        } catch (error) {
          if (errorCode(error) !== 'already_completed') continue;
          await discardSubmission(submission, options.files);
          await queue.settle(pending.mutation.mutationId);
          processed += 1;
        }
      }

      return {
        processed,
        remaining: (await evidencePending()).length,
      };
    },
  });
}
