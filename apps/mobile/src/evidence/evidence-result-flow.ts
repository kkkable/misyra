import type { EvidenceVerificationReasonCode } from '@misyra/contracts';

export type EvidenceResultFlowState = 'waiting' | 'accepted' | 'rejected' | 'expired';

export type EvidenceResultFlowInput = Readonly<{
  verificationStatus: 'pending' | 'queued' | 'accepted' | 'rejected';
  attemptNumber: 1 | 2 | 3;
  expired: boolean;
  reasonCode: EvidenceVerificationReasonCode | null;
}>;

export type EvidenceResultFlow = Readonly<{
  state: EvidenceResultFlowState;
  remainingAttempts: number;
  canRetry: boolean;
  canSelfConfirm: boolean;
  reasonMessageKey: string | null;
}>;

export function resolveEvidenceResultFlow(_input: EvidenceResultFlowInput): EvidenceResultFlow {
  throw new Error('MTS-082 evidence result flow not implemented');
}
