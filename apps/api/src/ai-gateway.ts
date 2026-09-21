import type {
  DifficultyClassificationGatewayRequest,
  EvidenceVerificationGatewayRequest,
  PlannerExtractionGatewayRequest,
} from '@misyra/contracts';

export interface AiGateway {
  classifyDifficulty(request: DifficultyClassificationGatewayRequest): Promise<unknown>;
  verifyEvidence(request: EvidenceVerificationGatewayRequest): Promise<unknown>;
  extractPlannerSchedule(request: PlannerExtractionGatewayRequest): Promise<unknown>;
}
