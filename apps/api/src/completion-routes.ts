import {
  completeMissionRequestSchema,
  completeMissionResultSchema,
  uuidSchema,
  type CompleteMissionRequest,
} from '@misyra/contracts';
import type { Pool } from 'pg';

import {
  CompletionRejectedError,
  completeMissionAuthoritatively,
} from './authoritative-completion.js';
import { ApiError, type ApiRouteDefinition } from './index.js';

type NoEvidenceCompletionRequest = CompleteMissionRequest &
  Readonly<{ completionMode: 'private' | 'trust' }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCompletionBody(value: unknown): NoEvidenceCompletionRequest {
  const parsed = completeMissionRequestSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('validation_failed');
  if (parsed.data.completionMode !== 'private' && parsed.data.completionMode !== 'trust') {
    throw new ApiError('validation_failed');
  }
  return parsed.data as NoEvidenceCompletionRequest;
}

function occurrenceIdFrom(value: unknown): string {
  if (!isRecord(value)) throw new ApiError('validation_failed');
  const parsed = uuidSchema.safeParse(value.occurrenceId);
  if (!parsed.success) throw new ApiError('validation_failed');
  return parsed.data;
}

function mapCompletionError(error: unknown): never {
  if (!(error instanceof CompletionRejectedError)) throw error;
  switch (error.reason) {
    case 'not_found':
    case 'deleted':
      throw new ApiError('not_found');
    case 'expired':
      throw new ApiError('completion_window_expired');
    case 'cancelled':
    case 'not_started':
    case 'completion_mode_not_allowed':
      throw new ApiError('conflict');
  }
}

export function createCompletionRoutes(pool: Pool): ApiRouteDefinition[] {
  return [
    {
      method: 'POST',
      path: '/missions/:occurrenceId/complete',
      handler: async (request, _reply, auth) => {
        const occurrenceId = occurrenceIdFrom(request.params);
        const body = parseCompletionBody(request.body);
        try {
          const result = await completeMissionAuthoritatively(pool, {
            accountId: auth.accountId,
            occurrenceId,
            completionType: body.completionMode === 'private' ? 'private' : 'trust_mode',
            effectiveActionAt: body.effectiveActionAt,
            deviceId: body.deviceId,
            idempotencyKey: body.idempotencyKey,
          });
          return completeMissionResultSchema.parse(result);
        } catch (error) {
          return mapCompletionError(error);
        }
      },
    },
  ];
}
