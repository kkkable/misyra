import { createHmac, timingSafeEqual } from 'node:crypto';

import type { AuthProvider } from '@misyra/contracts';

import type { AuthAccount, ProviderProofVerifier, VerifiedProviderProof } from './auth.js';

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

const DEFAULT_ISSUERS: Record<AuthProvider, readonly string[]> = {
  apple: ['https://appleid.apple.com'],
  google: ['https://accounts.google.com', 'accounts.google.com'],
};
const REAUTHENTICATION_MAX_AGE_MS = 5 * 60_000;
const REAUTHENTICATION_TOKEN_PREFIX = 'misyra-reauth-v1';

export class AccountLifecycleSecurityError extends Error {
  constructor() {
    super('invalid_reauthentication');
    this.name = 'AccountLifecycleSecurityError';
  }
}

function issuerMatches(expected: string | readonly string[], actual: string) {
  return typeof expected === 'string' ? expected === actual : expected.includes(actual);
}

function reauthenticationDeadline(proof: VerifiedProviderProof) {
  return new Date(
    Math.min(proof.issuedAt.getTime() + REAUTHENTICATION_MAX_AGE_MS, proof.expiresAt.getTime()),
  );
}

function assertFreshAccountProof(
  account: AuthAccount,
  proof: VerifiedProviderProof,
  input: ReauthenticationInput,
  now: Date,
  expectedAudience: string,
  expectedIssuer: string | readonly string[],
) {
  const deadline = reauthenticationDeadline(proof);
  if (
    input.provider !== account.provider ||
    proof.provider !== account.provider ||
    proof.subject !== account.subject ||
    proof.subject.length === 0 ||
    proof.audience !== expectedAudience ||
    !issuerMatches(expectedIssuer, proof.issuer) ||
    proof.nonce !== input.nonce ||
    proof.issuedAt.getTime() > now.getTime() ||
    proof.expiresAt.getTime() <= now.getTime() ||
    deadline.getTime() <= now.getTime()
  ) {
    throw new AccountLifecycleSecurityError();
  }
  return deadline;
}

export function createHmacReauthenticationProofCodec(secret: string) {
  if (secret.length < 32) {
    throw new Error('reauthentication proof secret must be at least 32 characters');
  }

  const sign = (payload: string) =>
    createHmac('sha256', secret)
      .update(`${REAUTHENTICATION_TOKEN_PREFIX}.${payload}`)
      .digest('base64url');

  return {
    issue(claims: ReauthenticationProofClaims) {
      const payload = Buffer.from(
        JSON.stringify({ sub: claims.accountId, exp: claims.expiresAt.getTime() }),
      ).toString('base64url');
      return `${REAUTHENTICATION_TOKEN_PREFIX}.${payload}.${sign(payload)}`;
    },
    verify(token: string): ReauthenticationProofClaims | null {
      const [prefix, payload, suppliedSignature, ...extra] = token.split('.');
      if (
        prefix !== REAUTHENTICATION_TOKEN_PREFIX ||
        !payload ||
        !suppliedSignature ||
        extra.length > 0
      ) {
        return null;
      }

      const expectedSignature = sign(payload);
      const expectedBuffer = Buffer.from(expectedSignature);
      const suppliedBuffer = Buffer.from(suppliedSignature);
      if (
        expectedBuffer.length !== suppliedBuffer.length ||
        !timingSafeEqual(expectedBuffer, suppliedBuffer)
      ) {
        return null;
      }

      try {
        const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
          sub?: unknown;
          exp?: unknown;
        };
        if (
          typeof parsed.sub !== 'string' ||
          parsed.sub.length === 0 ||
          typeof parsed.exp !== 'number' ||
          !Number.isFinite(parsed.exp)
        ) {
          return null;
        }
        const expiresAt = new Date(parsed.exp);
        return Number.isNaN(expiresAt.getTime())
          ? null
          : { accountId: parsed.sub, expiresAt };
      } catch {
        return null;
      }
    },
  };
}

export function createAccountLifecycleService(options: AccountLifecycleServiceOptions) {
  const now = options.now ?? (() => new Date());
  const expectedIssuer = options.expectedIssuer ?? DEFAULT_ISSUERS;

  return {
    async reauthenticate(
      accountId: string,
      input: ReauthenticationInput,
    ): Promise<ReauthenticationGrant> {
      const account = await options.identityStore.findAccountById(accountId);
      if (!account || input.provider !== account.provider) {
        throw new AccountLifecycleSecurityError();
      }

      let proof: VerifiedProviderProof;
      try {
        proof = await options.verifier.verify(account.provider, input.proof);
      } catch {
        throw new AccountLifecycleSecurityError();
      }

      const expiresAt = assertFreshAccountProof(
        account,
        proof,
        input,
        now(),
        options.expectedAudience[account.provider],
        expectedIssuer[account.provider],
      );

      if (
        !(await options.identityStore.consumeProviderNonce(
          account.provider,
          account.subject,
          proof.nonce,
        ))
      ) {
        throw new AccountLifecycleSecurityError();
      }

      return {
        reauthenticationProof: options.issueReauthenticationProof({ accountId, expiresAt }),
        expiresAt: expiresAt.toISOString(),
      };
    },

    async deleteAccount(accountId: string, reauthenticationProof: string) {
      const claims = options.verifyReauthenticationProof(reauthenticationProof);
      if (
        !claims ||
        claims.accountId !== accountId ||
        claims.expiresAt.getTime() <= now().getTime()
      ) {
        throw new AccountLifecycleSecurityError();
      }
      return options.deleteAccount(accountId);
    },
  };
}
