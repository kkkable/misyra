import type {
  DifficultyClassificationGatewayRequest,
  EvidenceVerificationGatewayRequest,
} from '@misyra/contracts';

export interface AiGateway {
  classifyDifficulty(request: DifficultyClassificationGatewayRequest): Promise<unknown>;
  verifyEvidence(request: EvidenceVerificationGatewayRequest): Promise<unknown>;
}
