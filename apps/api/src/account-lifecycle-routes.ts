import type { AuthProvider } from '@misyra/contracts';

import type { ApiRouteDefinition } from './index.js';

export type AccountLifecycleRouteService = {
  reauthenticate(
    accountId: string,
    input: Readonly<{ provider: AuthProvider; proof: string; nonce: string }>,
  ): Promise<Readonly<{ reauthenticationProof: string; expiresAt: string }>>;
  deleteAccount(
    accountId: string,
    reauthenticationProof: string,
  ): Promise<Readonly<{ deleted: true }>>;
};

export function createAccountLifecycleRoutes(
  _service: AccountLifecycleRouteService,
): ApiRouteDefinition[] {
  return [];
}
