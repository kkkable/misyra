import { ApiError, type ApiRouteDefinition } from './index.js';
import { ProtectedMediaError, type ProtectedMediaService } from './protected-media.js';

function mapError(error: unknown): never {
  if (error instanceof ProtectedMediaError) {
    throw new ApiError(error.code);
  }
  throw error;
}

export function createProtectedMediaRoutes(service: ProtectedMediaService): ApiRouteDefinition[] {
  return [
    {
      method: 'POST',
      path: '/media/assets/:assetId/upload-authorizations',
      handler: async (request, _reply, auth) => {
        const params = request.params as { assetId?: unknown };
        const assetId = typeof params.assetId === 'string' ? params.assetId : '';
        const body =
          typeof request.body === 'object' && request.body !== null
            ? (request.body as {
                purpose?: unknown;
                variant?: unknown;
                contentType?: unknown;
              })
            : {};
        try {
          return await service.authorizeUpload(auth.accountId, assetId, body);
        } catch (error) {
          return mapError(error);
        }
      },
    },
    {
      method: 'PUT',
      path: '/media/uploads/:token',
      bodyLimit: 12 * 1024 * 1024,
      handler: async (request, _reply, auth) => {
        const params = request.params as { token?: unknown };
        const token = typeof params.token === 'string' ? params.token : '';
        try {
          return await service.upload(auth.accountId, token, request.body);
        } catch (error) {
          return mapError(error);
        }
      },
    },
  ];
}
