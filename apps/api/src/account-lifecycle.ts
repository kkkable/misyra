import type { AuthProvider } from '@misyra/contracts';

import type { AuthAccount, ProviderProofVerifier } from './auth.js';

export type ReauthenticationInput = Readonly<{
  provider: AuthProvider;
  proof: string;
  nonce: string;
}>;

export type ReauthenticationGrant = Readonly<{
  reauthenticationProof: string;
  expiresAt: string;
}>;

export type ReauthenticationProofClaims = Readonly<{
  accountId: string;
  expiresAt: Date;
}>;

export type AccountLifecycleIdentityStore = Readonly<{
  findAccountById(accountId: string): Promise<AuthAccount | null>;
  consumeProviderNonce(provider: AuthProvider, subject: string, nonce: string): Promise<boolean>;
}>;

export type AccountLifecycleServiceOptions = Readonly<{
  identityStore: AccountLifecycleIdentityStore;
  verifier: ProviderProofVerifier;
  expectedAudience: Record<AuthProvider, string>;
  expectedIssuer?: Record<AuthProvider, string | readonly string[]>;
  issueReauthenticationProof(claims: ReauthenticationProofClaims): string;
  verifyReauthenticationProof(proof: string): ReauthenticationProofClaims | null;
  deleteAccount(accountId: string): Promise<{ deleted: true }>;
  now?: () => Date;
}>;

export class AccountLifecycleSecurityError extends Error {
  constructor() {
    super('invalid_reauthentication');
    this.name = 'AccountLifecycleSecurityError';
  }
}

export function createAccountLifecycleService(options: AccountLifecycleServiceOptions) {
  void options;
  return {
    reauthenticate(
      accountId: string,
      input: ReauthenticationInput,
    ): Promise<ReauthenticationGrant> {
      void accountId;
      void input;
      return Promise.reject(new Error('reauthentication_not_implemented'));
    },
    deleteAccount(accountId: string, reauthenticationProof: string) {
      void accountId;
      void reauthenticationProof;
      return Promise.reject(new Error('account_deletion_authorization_not_implemented'));
    },
  };
}
