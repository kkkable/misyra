import type { PlannerExtractionInput, PlannerExtractionResult } from '@misyra/contracts';

import type { AiGateway } from './ai-gateway.js';

export const PLANNER_EXTRACTION_SYSTEM_PROMPT = 'MTS-087 planner extraction is not implemented.';

export class PlannerExtractionInvalidOutputError extends Error {
  constructor() {
    super('Planner extraction provider output is invalid.');
    this.name = 'PlannerExtractionInvalidOutputError';
  }
}

export function createPlannerExtractionService(input: {
  readonly gateway: Pick<AiGateway, 'extractPlannerSchedule'>;
}) {
  return Object.freeze({
    async extract(request: PlannerExtractionInput): Promise<PlannerExtractionResult> {
      await Promise.resolve();
      void input;
      void request;
      throw new Error('MTS-087 planner extraction is not implemented.');
    },
  });
}
