import {
  authProviderExchangeRequestSchema,
  authRefreshRequestSchema,
  authSignOutRequestSchema,
  authSignOutResponseSchema,
  authTokenPairSchema,
  type AuthProvider,
  type AuthProviderExchangeRequest,
  type AuthSignOutResponse,
  type AuthTokenPair,
} from '@misyra/contracts';

import { AuthSecurityError } from './auth.js';
import { ApiError, type ApiRouteDefinition } from './index.js';

export type AuthRouteService = {
  exchange(input: AuthProviderExchangeRequest & { provider: AuthProvider }): Promise<AuthTokenPair>;
  refresh(refreshToken: string): Promise<AuthTokenPair>;
  signOut(refreshToken: string): Promise<AuthSignOutResponse>;
};

function parseExchangeBody(value: unknown): AuthProviderExchangeRequest {
  const parsed = authProviderExchangeRequestSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('validation_failed');
  return parsed.data;
}

function parseRefreshBody(value: unknown) {
  const parsed = authRefreshRequestSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('validation_failed');
  return parsed.data.refreshToken;
}

function parseSignOutBody(value: unknown) {
  const parsed = authSignOutRequestSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('validation_failed');
  return parsed.data.refreshToken;
}

async function runAuthOperation(operation: () => Promise<AuthTokenPair>) {
  try {
    return authTokenPairSchema.parse(await operation());
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
    handler: (request) => {
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
      handler: (request) => runAuthOperation(() => service.refresh(parseRefreshBody(request.body))),
    },
    {
      method: 'POST',
      path: '/auth/sign-out',
      public: true,
      handler: async (request) =>
        authSignOutResponseSchema.parse(await service.signOut(parseSignOutBody(request.body))),
    },
  ];
}
