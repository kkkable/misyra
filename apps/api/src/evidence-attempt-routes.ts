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
      method: 'GET',
      path: '/evidence/occurrences/:occurrenceId/latest-attempt',
      handler: async (request, _reply, auth) => {
        const params = request.params as { occurrenceId?: unknown };
        try {
          return await service.getLatestAttemptId(auth.accountId, params.occurrenceId);
        } catch (error) {
          return mapError(error);
        }
      },
    },
    {
      method: 'GET',
      path: '/evidence/attempts/:attemptId',
      handler: async (request, _reply, auth) => {
        const params = request.params as { attemptId?: unknown };
        try {
          return await service.getResult(auth.accountId, params.attemptId);
        } catch (error) {
          return mapError(error);
        }
      },
    },
    {
      method: 'GET',
      path: '/evidence/attempts/:attemptId/media/original',
      handler: async (request, reply, auth) => {
        const params = request.params as { attemptId?: unknown };
        try {
          const body = await service.getMediaOriginal(auth.accountId, params.attemptId);
          return await reply.type('image/jpeg').send(body);
        } catch (error) {
          return mapError(error);
        }
      },
    },
    {
      method: 'DELETE',
      path: '/evidence/attempts/:attemptId/media',
      handler: async (request, _reply, auth) => {
        const params = request.params as { attemptId?: unknown };
        try {
          return await service.deleteMedia(auth.accountId, params.attemptId);
        } catch (error) {
          return mapError(error);
        }
      },
    },
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
