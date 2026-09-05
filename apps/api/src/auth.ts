import { createHash, randomUUID } from 'node:crypto';

export type AuthProvider = 'apple' | 'google';

export type VerifiedProviderProof = {
  provider: AuthProvider;
  subject: string;
  issuer: string;
  audience: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
  email?: string;
};

export type ProviderProofVerifier = {
  /**
   * Cryptographically verifies the provider proof signature and returns only trusted claims.
   * Implementations must reject unknown signing keys or invalid signatures before returning.
   */
  verify(provider: AuthProvider, proof: string): Promise<VerifiedProviderProof>;
};

export type AuthAccount = {
  id: string;
  provider: AuthProvider;
  subject: string;
};

export type CreateSessionInput = {
  id: string;
  accountId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
};

export type RotateSessionInput = {
  presentedHash: string;
  nextHash: string;
  nextExpiresAt: Date;
  now: Date;
};

export type RotateSessionResult =
  | { status: 'rotated'; accountId: string; sessionId: string }
  | { status: 'reused' }
  | { status: 'invalid' };

export type AuthStore = {
  findOrCreateAccount(provider: AuthProvider, subject: string): Promise<AuthAccount>;
  consumeProviderNonce(provider: AuthProvider, subject: string, nonce: string): Promise<boolean>;
  createSession(input: CreateSessionInput): Promise<void>;
  rotateSession(input: RotateSessionInput): Promise<RotateSessionResult>;
};

export type AuthSecurityErrorCode =
  'invalid_provider_proof' | 'invalid_refresh_token' | 'refresh_token_reuse';

export class AuthSecurityError extends Error {
  readonly code: AuthSecurityErrorCode;

  constructor(code: AuthSecurityErrorCode) {
    super(code);
    this.name = 'AuthSecurityError';
    this.code = code;
  }
}

type AccessTokenInput = {
  accountId: string;
  sessionId: string;
  expiresAt: Date;
};

type AuthServiceOptions = {
  store: AuthStore;
  verifier: ProviderProofVerifier;
  expectedAudience: Record<AuthProvider, string>;
  expectedIssuer?: Record<AuthProvider, string | readonly string[]>;
  now?: () => Date;
  issueOpaqueRefreshToken?: () => string;
  issueAccessToken: (input: AccessTokenInput) => string | Promise<string>;
  accessTokenLifetimeSeconds?: number;
  refreshTokenLifetimeSeconds?: number;
  defaultProofMaxAgeSeconds?: number;
};

type ExchangeInput = {
  provider: AuthProvider;
  proof: string;
  nonce: string;
  maxAgeSeconds?: number;
};

export type AuthTokenPair = {
  accountId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

const DEFAULT_ISSUERS: Record<AuthProvider, readonly string[]> = {
  apple: ['https://appleid.apple.com'],
  google: ['https://accounts.google.com', 'accounts.google.com'],
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function plusSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1_000);
}

function issuerMatches(expectedIssuer: string | readonly string[], actualIssuer: string) {
  return typeof expectedIssuer === 'string'
    ? actualIssuer === expectedIssuer
    : expectedIssuer.includes(actualIssuer);
}

function assertProviderProof(
  proof: VerifiedProviderProof,
  input: ExchangeInput,
  now: Date,
  expectedIssuer: string | readonly string[],
  expectedAudience: string,
  defaultMaxAgeSeconds: number,
) {
  const maxAgeSeconds = input.maxAgeSeconds ?? defaultMaxAgeSeconds;
  const ageMs = now.getTime() - proof.issuedAt.getTime();

  if (
    proof.provider !== input.provider ||
    !issuerMatches(expectedIssuer, proof.issuer) ||
    proof.audience !== expectedAudience ||
    proof.nonce !== input.nonce ||
    proof.subject.length === 0 ||
    proof.issuedAt.getTime() > now.getTime() ||
    proof.expiresAt.getTime() <= now.getTime() ||
    ageMs > maxAgeSeconds * 1_000
  ) {
    throw new AuthSecurityError('invalid_provider_proof');
  }
}

export function createAuthService(options: AuthServiceOptions) {
  const now = options.now ?? (() => new Date());
  const issueOpaqueRefreshToken = options.issueOpaqueRefreshToken ?? (() => randomUUID());
  const expectedIssuer = options.expectedIssuer ?? DEFAULT_ISSUERS;
  const accessTokenLifetimeSeconds = options.accessTokenLifetimeSeconds ?? 15 * 60;
  const refreshTokenLifetimeSeconds = options.refreshTokenLifetimeSeconds ?? 30 * 24 * 60 * 60;
  const defaultProofMaxAgeSeconds = options.defaultProofMaxAgeSeconds ?? 10 * 60;

  return {
    async exchange(input: ExchangeInput): Promise<AuthTokenPair> {
      let proof: VerifiedProviderProof;
      try {
        proof = await options.verifier.verify(input.provider, input.proof);
      } catch (error) {
        if (error instanceof AuthSecurityError) throw error;
        throw new AuthSecurityError('invalid_provider_proof');
      }

      const currentTime = now();
      assertProviderProof(
        proof,
        input,
        currentTime,
        expectedIssuer[input.provider],
        options.expectedAudience[input.provider],
        defaultProofMaxAgeSeconds,
      );

      // Email is intentionally ignored. Provider + subject is the immutable account key.
      const account = await options.store.findOrCreateAccount(input.provider, proof.subject);
      if (!(await options.store.consumeProviderNonce(input.provider, proof.subject, proof.nonce))) {
        throw new AuthSecurityError('invalid_provider_proof');
      }

      const sessionId = randomUUID();
      const familyId = randomUUID();
      const refreshToken = issueOpaqueRefreshToken();
      const refreshTokenExpiresAt = plusSeconds(currentTime, refreshTokenLifetimeSeconds);
      const accessTokenExpiresAt = plusSeconds(currentTime, accessTokenLifetimeSeconds);

      await options.store.createSession({
        id: sessionId,
        accountId: account.id,
        familyId,
        refreshTokenHash: sha256(refreshToken),
        expiresAt: refreshTokenExpiresAt,
      });

      return {
        accountId: account.id,
        accessToken: await options.issueAccessToken({
          accountId: account.id,
          sessionId,
          expiresAt: accessTokenExpiresAt,
        }),
        accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
        refreshToken,
        refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
      };
    },

    async refresh(presentedRefreshToken: string): Promise<AuthTokenPair> {
      const currentTime = now();
      const nextRefreshToken = issueOpaqueRefreshToken();
      const nextRefreshTokenExpiresAt = plusSeconds(currentTime, refreshTokenLifetimeSeconds);
      const result = await options.store.rotateSession({
        presentedHash: sha256(presentedRefreshToken),
        nextHash: sha256(nextRefreshToken),
        nextExpiresAt: nextRefreshTokenExpiresAt,
        now: currentTime,
      });

      if (result.status === 'reused') throw new AuthSecurityError('refresh_token_reuse');
      if (result.status === 'invalid') throw new AuthSecurityError('invalid_refresh_token');

      const accessTokenExpiresAt = plusSeconds(currentTime, accessTokenLifetimeSeconds);
      return {
        accountId: result.accountId,
        accessToken: await options.issueAccessToken({
          accountId: result.accountId,
          sessionId: result.sessionId,
          expiresAt: accessTokenExpiresAt,
        }),
        accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
        refreshToken: nextRefreshToken,
        refreshTokenExpiresAt: nextRefreshTokenExpiresAt.toISOString(),
      };
    },
  };
}
