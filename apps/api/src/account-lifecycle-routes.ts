import {
  accountDeleteRequestSchema,
  accountDeleteResponseSchema,
  authReauthenticateRequestSchema,
  authReauthenticateResponseSchema,
  type AccountDeleteResponse,
  type AuthReauthenticateRequest,
  type AuthReauthenticateResponse,
} from '@misyra/contracts';

import { AccountLifecycleSecurityError } from './account-lifecycle.js';
import { ApiError, type ApiRouteDefinition } from './index.js';

export type AccountLifecycleRouteService = {
  reauthenticate(
    accountId: string,
    input: AuthReauthenticateRequest,
  ): Promise<AuthReauthenticateResponse>;
  deleteAccount(accountId: string, reauthenticationProof: string): Promise<AccountDeleteResponse>;
};

function parseReauthenticateBody(value: unknown) {
  const parsed = authReauthenticateRequestSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('validation_failed');
  return parsed.data;
}

function parseDeleteBody(value: unknown) {
  const parsed = accountDeleteRequestSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('validation_failed');
  return parsed.data;
}

async function runLifecycleOperation<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AccountLifecycleSecurityError) throw new ApiError('unauthorized');
    throw error;
  }
}

export function createAccountLifecycleRoutes(
  service: AccountLifecycleRouteService,
): ApiRouteDefinition[] {
  return [
    {
      method: 'POST',
      path: '/auth/reauthenticate',
      handler: async (request, _reply, auth) => {
        const body = parseReauthenticateBody(request.body);
        return authReauthenticateResponseSchema.parse(
          await runLifecycleOperation(() => service.reauthenticate(auth.accountId, body)),
        );
      },
    },
    {
      method: 'DELETE',
      path: '/account',
      handler: async (request, _reply, auth) => {
        const body = parseDeleteBody(request.body);
        return accountDeleteResponseSchema.parse(
          await runLifecycleOperation(() =>
            service.deleteAccount(auth.accountId, body.reauthenticationProof),
          ),
        );
      },
    },
  ];
}
