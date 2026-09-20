export type EvidenceSubmissionSessionValue = Readonly<{
  attemptId: string;
  submittedAt: string;
}>;

export function createEvidenceSubmissionSession(
  generateAttemptId: () => string,
  now: () => Date = () => new Date(),
) {
  let current: EvidenceSubmissionSessionValue | null = null;

  return Object.freeze({
    getOrCreate(): EvidenceSubmissionSessionValue {
      if (current === null) {
        current = Object.freeze({
          attemptId: generateAttemptId(),
          submittedAt: now().toISOString(),
        });
      }
      return current;
    },
    reset(): void {
      current = null;
    },
  });
}
