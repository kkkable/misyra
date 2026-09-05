import { AuthSecurityError, type AuthProvider, type AuthTokenPair } from './auth.js';
import { ApiError, type ApiRouteDefinition } from './index.js';

export type AuthRouteService = {
  exchange(input: { provider: AuthProvider; proof: string; nonce: string }): Promise<AuthTokenPair>;
  refresh(refreshToken: string): Promise<AuthTokenPair>;
};

function parseExchangeBody(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError('validation_failed');
  }
  const { proof, nonce } = value as Record<string, unknown>;
  if (
    typeof proof !== 'string' ||
    proof.length === 0 ||
    typeof nonce !== 'string' ||
    nonce.length === 0
  ) {
    throw new ApiError('validation_failed');
  }
  return { proof, nonce };
}

function parseRefreshBody(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError('validation_failed');
  }
  const { refreshToken } = value as Record<string, unknown>;
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    throw new ApiError('validation_failed');
  }
  return refreshToken;
}

async function runAuthOperation<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AuthSecurityError) throw new ApiError('unauthorized');
    throw error;
  }
}

export function createAuthRoutes(service: AuthRouteService): ApiRouteDefinition[] {
  const exchangeRoute = (provider: AuthProvider): ApiRouteDefinition => ({
    method: 'POST',
    path: `/auth/${provider}/exchange`,
    public: true,
    handler: async (request) => {
      const body = parseExchangeBody(request.body);
      return runAuthOperation(() => service.exchange({ provider, ...body }));
    },
  });

  return [
    exchangeRoute('apple'),
    exchangeRoute('google'),
    {
      method: 'POST',
      path: '/auth/refresh',
      public: true,
      handler: async (request) =>
        runAuthOperation(() => service.refresh(parseRefreshBody(request.body))),
    },
  ];
}
