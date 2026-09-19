import type {
  EvidenceVerificationAiOutput,
  EvidenceVerificationReasonCode,
} from '@misyra/contracts';
import type { ClaimedOutboxEvent } from '@misyra/database';
import type { Pool } from 'pg';

import type { AiGateway } from './ai-gateway.js';

export type EvidenceVerificationResult = Readonly<{
  attemptId: string;
  occurrenceId: string;
  attemptNumber: number;
  firstSubmittedAt: string;
  effectiveSubmittedAt: string;
  verdict: EvidenceVerificationAiOutput['verdict'];
  reasonCode: EvidenceVerificationReasonCode;
}>;

export class EvidenceVerificationInvalidOutputError extends Error {
  constructor() {
    super('Evidence verification provider returned invalid structured output');
    this.name = 'EvidenceVerificationInvalidOutputError';
  }
}

export function createEvidenceVerificationService(_input: {
  readonly pool: Pool;
  readonly gateway: Pick<AiGateway, 'verifyEvidence'>;
}) {
  return Object.freeze({
    async processOutboxEvent(_event: ClaimedOutboxEvent): Promise<EvidenceVerificationResult> {
      throw new Error('MTS-081 evidence verification not implemented');
    },
  });
}

export type EvidenceVerificationService = ReturnType<typeof createEvidenceVerificationService>;
