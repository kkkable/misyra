import { EvidenceAttemptError, type EvidenceAttemptService } from './evidence-attempt.js';
import { ApiError, type ApiRouteDefinition } from './index.js';

function mapError(error: unknown): never {
  if (error instanceof EvidenceAttemptError) {
    throw new ApiError(error.code);
  }
  throw error;
}

export function createEvidenceAttemptRoutes(service: EvidenceAttemptService): ApiRouteDefinition[] {
  return [
    {
      method: 'POST',
      path: '/evidence/occurrences/:occurrenceId/attempts',
      handler: async (request, _reply, auth) => {
        const params = request.params as { occurrenceId?: unknown };
        const occurrenceId = params.occurrenceId;
        const body =
          typeof request.body === 'object' && request.body !== null
            ? (request.body as {
                attemptId?: unknown;
                submittedAt?: unknown;
                contentType?: unknown;
              })
            : {};
        try {
          return await service.reserve(auth.accountId, occurrenceId, body);
        } catch (error) {
          return mapError(error);
        }
      },
    },
  ];
}
