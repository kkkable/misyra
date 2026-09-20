import type { EvidenceVerificationReasonCode } from '@misyra/contracts';

export type EvidenceResultFlowState = 'waiting' | 'accepted' | 'rejected' | 'expired';

export type EvidenceResultFlowInput = Readonly<{
  verificationStatus: 'pending' | 'queued' | 'accepted' | 'rejected';
  attemptNumber: 1 | 2 | 3;
  expired: boolean;
  reasonCode: EvidenceVerificationReasonCode | null;
}>;

export type EvidenceReasonMessageKey =
  | 'evidence.result.reason.taskMismatch'
  | 'evidence.result.reason.taskNotEvident'
  | 'evidence.result.reason.imageUnusable';

export type EvidenceResultFlow = Readonly<{
  state: EvidenceResultFlowState;
  remainingAttempts: number;
  canRetry: boolean;
  canSelfConfirm: boolean;
  reasonMessageKey: EvidenceReasonMessageKey | null;
}>;

function reasonMessageKey(
  reasonCode: EvidenceVerificationReasonCode | null,
): EvidenceReasonMessageKey | null {
  switch (reasonCode) {
    case 'task_mismatch':
      return 'evidence.result.reason.taskMismatch';
    case 'task_not_evident':
      return 'evidence.result.reason.taskNotEvident';
    case 'image_unusable':
      return 'evidence.result.reason.imageUnusable';
    case 'verified':
    case null:
      return null;
  }
}

export function resolveEvidenceResultFlow(input: EvidenceResultFlowInput): EvidenceResultFlow {
  const remainingAttempts = 3 - input.attemptNumber;
  if (input.verificationStatus === 'accepted') {
    return {
      state: 'accepted',
      remainingAttempts,
      canRetry: false,
      canSelfConfirm: false,
      reasonMessageKey: null,
    };
  }
  if (input.verificationStatus === 'pending' || input.verificationStatus === 'queued') {
    return {
      state: 'waiting',
      remainingAttempts,
      canRetry: false,
      canSelfConfirm: false,
      reasonMessageKey: null,
    };
  }

  const reason = reasonMessageKey(input.reasonCode);
  return {
    state: input.expired ? 'expired' : 'rejected',
    remainingAttempts,
    canRetry: !input.expired && remainingAttempts > 0,
    canSelfConfirm: !input.expired,
    reasonMessageKey: reason,
  };
}
