import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  AuthSecurityError,
  createAuthService,
  type AuthStore,
  type ProviderProofVerifier,
} from './auth.js';

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function createHarness() {
  let sequence = 0;
  const accounts = new Map<string, { id: string; provider: 'apple' | 'google'; subject: string }>();
  const sessions = new Map<
    string,
    {
      id: string;
      accountId: string;
      familyId: string;
      refreshTokenHash: string;
      previousRefreshTokenHash: string | null;
      expiresAt: Date;
      revokedAt: Date | null;
    }
  >();

  const store: AuthStore = {
    async findOrCreateAccount(provider, subject) {
      const key = `${provider}:${subject}`;
      let account = accounts.get(key);
      if (!account) {
        account = { id: `account-${++sequence}`, provider, subject };
        accounts.set(key, account);
      }
      return account;
    },
    async createSession(input) {
      sessions.set(input.id, { ...input, previousRefreshTokenHash: null, revokedAt: null });
    },
    async rotateSession(input) {
      const session = [...sessions.values()].find(
        (candidate) =>
          candidate.refreshTokenHash === input.presentedHash ||
          candidate.previousRefreshTokenHash === input.presentedHash,
      );
      if (!session || session.revokedAt) return { status: 'invalid' as const };
      if (session.previousRefreshTokenHash === input.presentedHash) {
        for (const candidate of sessions.values()) {
          if (candidate.familyId === session.familyId) candidate.revokedAt = input.now;
        }
        return { status: 'reused' as const };
      }
      if (session.expiresAt <= input.now) return { status: 'invalid' as const };
      session.previousRefreshTokenHash = session.refreshTokenHash;
      session.refreshTokenHash = input.nextHash;
      session.expiresAt = input.nextExpiresAt;
      return { status: 'rotated' as const, accountId: session.accountId, sessionId: session.id };
    },
  };

  const verifier: ProviderProofVerifier = {
    async verify(provider, proof) {
      if (proof === 'bad-signature') throw new AuthSecurityError('invalid_provider_proof');
      return {
        provider,
        subject: proof === 'same-email-other-subject' ? 'subject-b' : 'subject-a',
        issuer: provider === 'apple' ? 'https://appleid.apple.com' : 'https://accounts.google.com',
        audience: provider === 'apple' ? 'com.misyra.app' : 'misyra-google-client',
        nonce: proof === 'wrong-nonce' ? 'other' : 'nonce-1',
        issuedAt: new Date('2026-09-05T03:00:00.000Z'),
        expiresAt: new Date('2026-09-05T03:10:00.000Z'),
        email: 'same@example.com',
      };
    },
  };

  const tokens = ['refresh-1', 'refresh-2', 'refresh-3', 'refresh-4'];
  const service = createAuthService({
    store,
    verifier,
    now: () => new Date('2026-09-05T03:05:00.000Z'),
    issueOpaqueRefreshToken: () => tokens.shift() ?? `refresh-${++sequence}`,
    issueAccessToken: ({ accountId, sessionId }) => `access:${accountId}:${sessionId}`,
    expectedAudience: {
      apple: 'com.misyra.app',
      google: 'misyra-google-client',
    },
  });

  return { service, accounts, sessions };
}

describe('MTS-034 server provider-token exchange', () => {
  it('binds identity to provider subject rather than provider email', async () => {
    const { service, accounts } = createHarness();

    const first = await service.exchange({ provider: 'google', proof: 'proof-a', nonce: 'nonce-1' });
    const second = await service.exchange({
      provider: 'google',
      proof: 'same-email-other-subject',
      nonce: 'nonce-1',
    });

    expect(first.accountId).not.toBe(second.accountId);
    expect(accounts.size).toBe(2);
  });

  it.each([
    ['wrong nonce', 'wrong-nonce', 'nonce-1'],
    ['invalid signature', 'bad-signature', 'nonce-1'],
  ])('rejects %s provider proofs', async (_label, proof, nonce) => {
    const { service } = createHarness();
    await expect(service.exchange({ provider: 'google', proof, nonce })).rejects.toBeInstanceOf(
      AuthSecurityError,
    );
  });

  it('rejects stale proofs even when the provider fake otherwise verifies them', async () => {
    const { service } = createHarness();
    await expect(
      service.exchange({ provider: 'google', proof: 'proof-a', nonce: 'nonce-1', maxAgeSeconds: 30 }),
    ).rejects.toMatchObject({ code: 'invalid_provider_proof' });
  });

  it('stores only hashed refresh tokens and rotates them on refresh', async () => {
    const { service, sessions } = createHarness();
    const exchanged = await service.exchange({ provider: 'apple', proof: 'proof-a', nonce: 'nonce-1' });
    const session = [...sessions.values()][0]!;

    expect(session.refreshTokenHash).toBe(hash(exchanged.refreshToken));
    expect(JSON.stringify([...sessions.values()])).not.toContain(exchanged.refreshToken);

    const rotated = await service.refresh(exchanged.refreshToken);
    expect(rotated.refreshToken).not.toBe(exchanged.refreshToken);
    expect(session.refreshTokenHash).toBe(hash(rotated.refreshToken));
  });

  it('revokes the whole session family when an already-rotated refresh token is reused', async () => {
    const { service, sessions } = createHarness();
    const exchanged = await service.exchange({ provider: 'google', proof: 'proof-a', nonce: 'nonce-1' });
    await service.refresh(exchanged.refreshToken);

    await expect(service.refresh(exchanged.refreshToken)).rejects.toMatchObject({
      code: 'refresh_token_reuse',
    });
    expect([...sessions.values()].every((session) => session.revokedAt instanceof Date)).toBe(true);
  });
});
