import {
  plannerExtractionInputSchema,
  uuidSchema,
  type PlannerExtractionInput,
  type PlannerExtractionResult,
} from '@misyra/contracts';
import type { Pool } from 'pg';

import {
  PlannerConfirmationInvalidDraftError,
  confirmPlannerDraft,
} from './planner-confirmation.js';
import { ApiError, type ApiRouteDefinition } from './index.js';

export type PlannerExtractionRouteService = Readonly<{
  extract(input: PlannerExtractionInput): Promise<PlannerExtractionResult>;
}>;

function bodyIdempotencyKey(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError('validation_failed');
  }
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length !== 1 || typeof source.idempotencyKey !== 'string') {
    throw new ApiError('validation_failed');
  }
  const key = uuidSchema.safeParse(source.idempotencyKey);
  if (!key.success) throw new ApiError('validation_failed');
  return key.data;
}

function draftIdFrom(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError('validation_failed');
  }
  const parsed = uuidSchema.safeParse((value as Record<string, unknown>).draftId);
  if (!parsed.success) throw new ApiError('validation_failed');
  return parsed.data;
}

function assertOwnedDraft(params: unknown, accountId: string): string {
  const draftId = draftIdFrom(params);
  if (draftId !== accountId) throw new ApiError('not_found');
  return draftId;
}

export function createPlannerRoutes(
  pool: Pool,
  extractionService?: PlannerExtractionRouteService,
  now: () => Date = () => new Date(),
): ApiRouteDefinition[] {
  return [
    {
      method: 'POST',
      path: '/ai-planner/drafts/:draftId/extract',
      handler: async (request, _reply, auth) => {
        assertOwnedDraft(request.params, auth.accountId);
        const parsed = plannerExtractionInputSchema.safeParse(request.body);
        if (!parsed.success) throw new ApiError('validation_failed');
        if (extractionService === undefined) throw new ApiError('temporarily_unavailable');
        try {
          return await extractionService.extract(parsed.data);
        } catch {
          throw new ApiError('temporarily_unavailable');
        }
      },
    },
    {
      method: 'POST',
      path: '/ai-planner/drafts/:draftId/confirm',
      handler: async (request, _reply, auth) => {
        assertOwnedDraft(request.params, auth.accountId);
        const idempotencyKey = bodyIdempotencyKey(request.body);
        try {
          return await confirmPlannerDraft(pool, {
            accountId: auth.accountId,
            idempotencyKey,
            now: now(),
          });
        } catch (error) {
          if (error instanceof PlannerConfirmationInvalidDraftError) {
            throw new ApiError('conflict');
          }
          throw error;
        }
      },
    },
  ];
}
