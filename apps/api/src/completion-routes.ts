import type { Pool } from 'pg';

import {
  CompletionRejectedError,
  completeMissionAuthoritatively,
} from './authoritative-completion.js';
import { ApiError, type ApiRouteDefinition } from './index.js';

type NoEvidenceCompletionMode = 'private' | 'trust';

type CompletionRequestBody = Readonly<{
  completionMode: NoEvidenceCompletionMode;
  effectiveActionAt: string;
  deviceId: string;
  idempotencyKey: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseCompletionBody(value: unknown): CompletionRequestBody {
  if (!isRecord(value)) throw new ApiError('validation_failed');
  const completionMode = value.completionMode;
  const effectiveActionAt = value.effectiveActionAt;
  const deviceId = value.deviceId;
  const idempotencyKey = value.idempotencyKey;

  if (
    (completionMode !== 'private' && completionMode !== 'trust') ||
    !nonEmptyString(effectiveActionAt) ||
    Number.isNaN(Date.parse(effectiveActionAt)) ||
    !nonEmptyString(deviceId) ||
    !nonEmptyString(idempotencyKey)
  ) {
    throw new ApiError('validation_failed');
  }

  return { completionMode, effectiveActionAt, deviceId, idempotencyKey };
}

function occurrenceIdFrom(value: unknown): string {
  if (!isRecord(value) || !nonEmptyString(value.occurrenceId)) {
    throw new ApiError('validation_failed');
  }
  return value.occurrenceId;
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
          return await completeMissionAuthoritatively(pool, {
            accountId: auth.accountId,
            occurrenceId,
            completionType: body.completionMode === 'private' ? 'private' : 'trust_mode',
            effectiveActionAt: body.effectiveActionAt,
            deviceId: body.deviceId,
            idempotencyKey: body.idempotencyKey,
          });
        } catch (error) {
          return mapCompletionError(error);
        }
      },
    },
  ];
}
