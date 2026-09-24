import type {
  DifficultyClassificationGatewayRequest,
  EvidenceVerificationGatewayRequest,
  PlannerExtractionGatewayRequest,
  StoryImageGenerationGatewayRequest,
  StoryStyleProfileGatewayRequest,
  StoryTextSuggestionsGatewayRequest,
} from '@misyra/contracts';

export interface AiGateway {
  classifyDifficulty(request: DifficultyClassificationGatewayRequest): Promise<unknown>;
  verifyEvidence(request: EvidenceVerificationGatewayRequest): Promise<unknown>;
  extractPlannerSchedule(request: PlannerExtractionGatewayRequest): Promise<unknown>;
  suggestStoryText(request: StoryTextSuggestionsGatewayRequest): Promise<unknown>;
  extractStoryStyleProfile(request: StoryStyleProfileGatewayRequest): Promise<unknown>;
  generateStoryImage(request: StoryImageGenerationGatewayRequest): Promise<unknown>;
}
