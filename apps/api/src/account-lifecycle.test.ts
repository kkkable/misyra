import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  AccountLifecycleSecurityError,
  createAccountLifecycleService,
  type ReauthenticationProofClaims,
} from './account-lifecycle.js';

const accountId = '123e4567-e89b-42d3-a456-426614174000';
const otherAccountId = '123e4567-e89b-42d3-a456-426614174001';
const now = new Date('2026-09-05T14:00:00.000Z');

function createHarness(
  options: {
    issuedAt?: Date;
    proofSubject?: string;
    consumeNonce?: boolean;
  } = {},
) {
  const account = { id: accountId, provider: 'google' as const, subject: 'subject-a' };
  const issuedAt = options.issuedAt ?? new Date('2026-09-05T13:59:00.000Z');
  const verifier = {
    verify: vi.fn((provider: 'apple' | 'google') =>
      Promise.resolve({
        provider,
        subject: options.proofSubject ?? 'subject-a',
        issuer: 'https://accounts.google.com',
        audience: 'misyra-google-client',
        nonce: 'nonce-1',
        issuedAt,
        expiresAt: new Date('2026-09-05T14:10:00.000Z'),
      }),
    ),
  };
  const identityStore = {
    findAccountById: vi.fn((id: string) => Promise.resolve(id === accountId ? account : null)),
    consumeProviderNonce: vi.fn(() => Promise.resolve(options.consumeNonce ?? true)),
  };
  const grants = new Map<string, ReauthenticationProofClaims>();
  const issueReauthenticationProof = vi.fn((claims: ReauthenticationProofClaims) => {
    const token = `reauth-${randomUUID()}`;
    grants.set(token, claims);
    return token;
  });
  const verifyReauthenticationProof = vi.fn((token: string) => grants.get(token) ?? null);
  const beforeDeleteAccount = vi.fn(() => Promise.resolve());
  const deleteAccount = vi.fn(() => Promise.resolve({ deleted: true as const }));
  const service = createAccountLifecycleService({
    identityStore,
    verifier,
    expectedAudience: { apple: 'misyra-apple-client', google: 'misyra-google-client' },
    expectedIssuer: {
      apple: 'https://appleid.apple.com',
      google: ['https://accounts.google.com', 'accounts.google.com'],
    },
    issueReauthenticationProof,
    verifyReauthenticationProof,
    beforeDeleteAccount,
    deleteAccount,
    now: () => now,
  });

  return {
    service,
    verifier,
    identityStore,
    issueReauthenticationProof,
    verifyReauthenticationProof,
    beforeDeleteAccount,
    deleteAccount,
  };
}

describe('MTS-037 recent reauthentication', () => {
  it('accepts the immutable account provider identity only while the provider proof is within five minutes', async () => {
    const issuedAt = new Date(now.getTime() - (5 * 60_000 - 1));
    const { service, identityStore, issueReauthenticationProof } = createHarness({ issuedAt });

    const grant = await service.reauthenticate(accountId, {
      provider: 'google',
      proof: 'fresh-provider-proof',
      nonce: 'nonce-1',
    });

    expect(identityStore.findAccountById).toHaveBeenCalledWith(accountId);
    expect(identityStore.consumeProviderNonce).toHaveBeenCalledWith(
      'google',
      'subject-a',
      'nonce-1',
    );
    expect(issueReauthenticationProof).toHaveBeenCalledWith({
      accountId,
      expiresAt: new Date(issuedAt.getTime() + 5 * 60_000),
    });
    expect(grant.expiresAt).toBe(new Date(issuedAt.getTime() + 5 * 60_000).toISOString());
  });

  it('rejects stale, cross-subject, or replayed provider proof before issuing deletion authority', async () => {
    const stale = createHarness({
      issuedAt: new Date(now.getTime() - (5 * 60_000 + 1)),
    });
    await expect(
      stale.service.reauthenticate(accountId, {
        provider: 'google',
        proof: 'stale-provider-proof',
        nonce: 'nonce-1',
      }),
    ).rejects.toBeInstanceOf(AccountLifecycleSecurityError);
    expect(stale.issueReauthenticationProof).not.toHaveBeenCalled();

    const wrongSubject = createHarness({ proofSubject: 'subject-b' });
    await expect(
      wrongSubject.service.reauthenticate(accountId, {
        provider: 'google',
        proof: 'other-account-proof',
        nonce: 'nonce-1',
      }),
    ).rejects.toBeInstanceOf(AccountLifecycleSecurityError);
    expect(wrongSubject.issueReauthenticationProof).not.toHaveBeenCalled();

    const replayed = createHarness({ consumeNonce: false });
    await expect(
      replayed.service.reauthenticate(accountId, {
        provider: 'google',
        proof: 'replayed-proof',
        nonce: 'nonce-1',
      }),
    ).rejects.toBeInstanceOf(AccountLifecycleSecurityError);
    expect(replayed.issueReauthenticationProof).not.toHaveBeenCalled();
  });

  it('binds deletion authority to the authenticated account and completes calendar cleanup first', async () => {
    const issuedAt = new Date(now.getTime() - 60_000);
    const { service, beforeDeleteAccount, deleteAccount } = createHarness({ issuedAt });
    const grant = await service.reauthenticate(accountId, {
      provider: 'google',
      proof: 'fresh-provider-proof',
      nonce: 'nonce-1',
    });

    await expect(service.deleteAccount(accountId, grant.reauthenticationProof)).resolves.toEqual({
      deleted: true,
    });
    expect(beforeDeleteAccount).toHaveBeenCalledWith(accountId);
    expect(deleteAccount).toHaveBeenCalledWith(accountId);
    expect(beforeDeleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
      deleteAccount.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );

    await expect(
      service.deleteAccount(otherAccountId, grant.reauthenticationProof),
    ).rejects.toBeInstanceOf(AccountLifecycleSecurityError);
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('does not delete account data when required calendar cleanup fails', async () => {
    const harness = createHarness({ issuedAt: new Date(now.getTime() - 60_000) });
    const grant = await harness.service.reauthenticate(accountId, {
      provider: 'google',
      proof: 'fresh-provider-proof',
      nonce: 'nonce-1',
    });
    harness.beforeDeleteAccount.mockRejectedValueOnce(new Error('calendar_disconnect_failed'));

    await expect(
      harness.service.deleteAccount(accountId, grant.reauthenticationProof),
    ).rejects.toThrow('calendar_disconnect_failed');
    expect(harness.deleteAccount).not.toHaveBeenCalled();
  });

  it('rejects a previously issued deletion proof once its five-minute provider-proof window expires', async () => {
    const issuedAt = new Date(now.getTime() - 60_000);
    const harness = createHarness({ issuedAt });
    const grant = await harness.service.reauthenticate(accountId, {
      provider: 'google',
      proof: 'fresh-provider-proof',
      nonce: 'nonce-1',
    });

    const expiredService = createAccountLifecycleService({
      identityStore: harness.identityStore,
      verifier: harness.verifier,
      expectedAudience: { apple: 'misyra-apple-client', google: 'misyra-google-client' },
      expectedIssuer: {
        apple: 'https://appleid.apple.com',
        google: ['https://accounts.google.com', 'accounts.google.com'],
      },
      issueReauthenticationProof: harness.issueReauthenticationProof,
      verifyReauthenticationProof: harness.verifyReauthenticationProof,
      beforeDeleteAccount: harness.beforeDeleteAccount,
      deleteAccount: harness.deleteAccount,
      now: () => new Date(issuedAt.getTime() + 5 * 60_000 + 1),
    });

    await expect(
      expiredService.deleteAccount(accountId, grant.reauthenticationProof),
    ).rejects.toBeInstanceOf(AccountLifecycleSecurityError);
    expect(harness.beforeDeleteAccount).not.toHaveBeenCalled();
    expect(harness.deleteAccount).not.toHaveBeenCalled();
  });
});
