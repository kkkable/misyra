import {
  difficultyClassificationAiOutputSchema,
  difficultyClassificationGatewayRequestSchema,
  difficultyClassificationResultSchema,
  difficultyClassificationSaveRequestSchema,
  type DifficultyClassificationGatewayRequest,
  type DifficultyClassificationResult,
  type DifficultyClassificationSaveRequest,
  type DifficultyClassificationTask,
} from '@misyra/contracts';

export interface AiGateway {
  classifyDifficulty(request: DifficultyClassificationGatewayRequest): Promise<unknown>;
}

export interface DifficultyClassificationService {
  classify(task: DifficultyClassificationTask): Promise<DifficultyClassificationResult>;
  classifyBeforeStartSave(input: DifficultyClassificationSaveRequest): Promise<
    | Readonly<{ recalculated: false; result: null }>
    | Readonly<{ recalculated: true; result: DifficultyClassificationResult }>
  >;
}

const CLASSIFICATION_DIMENSIONS = [
  'physical_effort',
  'mental_effort',
  'complexity',
  'preparation',
] as const;

const FALLBACK_CLASSIFICATION = difficultyClassificationResultSchema.parse({
  difficulty: 'normal',
  internalMissionType: null,
  explanation: null,
  confidence: 0,
  modelVersion: 'fallback',
  classificationSource: 'fallback',
});

const RELEVANT_RECALCULATION_FIELDS = new Set(['title', 'description', 'estimated_duration']);

export function createDifficultyClassificationService(input: {
  readonly gateway: AiGateway;
}): DifficultyClassificationService {
  async function classify(
    task: DifficultyClassificationTask,
  ): Promise<DifficultyClassificationResult> {
    const request = difficultyClassificationGatewayRequestSchema.parse({
      ...task,
      classificationDimensions: CLASSIFICATION_DIMENSIONS,
    });

    try {
      const providerOutput = await input.gateway.classifyDifficulty(request);
      const parsed = difficultyClassificationAiOutputSchema.safeParse(providerOutput);
      if (!parsed.success) {
        return FALLBACK_CLASSIFICATION;
      }

      return difficultyClassificationResultSchema.parse({
        ...parsed.data,
        classificationSource: 'ai',
      });
    } catch {
      return FALLBACK_CLASSIFICATION;
    }
  }

  async function classifyBeforeStartSave(
    requestInput: DifficultyClassificationSaveRequest,
  ): Promise<
    | Readonly<{ recalculated: false; result: null }>
    | Readonly<{ recalculated: true; result: DifficultyClassificationResult }>
  > {
    const request = difficultyClassificationSaveRequestSchema.parse(requestInput);
    const savedBeforeStart =
      Date.parse(request.savedAtInstant) < Date.parse(request.scheduledStartInstant);
    const hasRelevantChange = request.changedFields.some((field) =>
      RELEVANT_RECALCULATION_FIELDS.has(field),
    );

    if (!savedBeforeStart || !hasRelevantChange) {
      return { recalculated: false, result: null };
    }

    return {
      recalculated: true,
      result: await classify(request.task),
    };
  }

  return Object.freeze({ classify, classifyBeforeStartSave });
}
