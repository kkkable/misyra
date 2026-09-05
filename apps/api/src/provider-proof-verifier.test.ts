import { generateKeyPairSync, sign } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { AuthSecurityError } from './auth.js';
import { createProviderProofVerifier } from './provider-proof-verifier.js';

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createSignedProof(
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', kid: 'test-key' },
) {
  const signingInput = `${encodeJson(header)}.${encodeJson(payload)}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

describe('MTS-034 provider proof verifier', () => {
  it.each(['apple', 'google'] as const)(
    'cryptographically verifies %s provider proofs',
    async (provider) => {
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const publicJwk = publicKey.export({ format: 'jwk' });
      const verifier = createProviderProofVerifier({
        jwksUrl: { apple: 'https://keys.test/apple', google: 'https://keys.test/google' },
        fetchJson: () =>
          Promise.resolve({ keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256' }] }),
      });
      const token = createSignedProof(privateKey, {
        iss: provider === 'apple' ? 'https://appleid.apple.com' : 'https://accounts.google.com',
        aud: provider === 'apple' ? 'com.misyra.app' : 'misyra-google-client',
        sub: 'provider-subject-1',
        nonce: 'nonce-1',
        iat: 1_788_579_600,
        exp: 1_788_580_200,
        email: 'ignored@example.com',
      });

      await expect(verifier.verify(provider, token)).resolves.toMatchObject({
        provider,
        subject: 'provider-subject-1',
        nonce: 'nonce-1',
      });
    },
  );

  it('rejects a proof whose signature does not match the provider key', async () => {
    const trusted = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicJwk = trusted.publicKey.export({ format: 'jwk' });
    const verifier = createProviderProofVerifier({
      jwksUrl: { apple: 'https://keys.test/apple', google: 'https://keys.test/google' },
      fetchJson: () => Promise.resolve({ keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256' }] }),
    });
    const token = createSignedProof(attacker.privateKey, {
      iss: 'https://accounts.google.com',
      aud: 'misyra-google-client',
      sub: 'provider-subject-1',
      nonce: 'nonce-1',
      iat: 1_788_579_600,
      exp: 1_788_580_200,
    });

    await expect(verifier.verify('google', token)).rejects.toBeInstanceOf(AuthSecurityError);
  });

  it('rejects unsupported algorithms and unknown signing keys before trusting claims', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicJwk = publicKey.export({ format: 'jwk' });
    const verifier = createProviderProofVerifier({
      jwksUrl: { apple: 'https://keys.test/apple', google: 'https://keys.test/google' },
      fetchJson: () =>
        Promise.resolve({ keys: [{ ...publicJwk, kid: 'trusted-key', alg: 'RS256' }] }),
    });
    const wrongAlgorithm = createSignedProof(
      privateKey,
      {
        iss: 'https://appleid.apple.com',
        aud: 'com.misyra.app',
        sub: 'subject',
        nonce: 'nonce-1',
        iat: 1_788_579_600,
        exp: 1_788_580_200,
      },
      { alg: 'HS256', kid: 'trusted-key' },
    );
    const unknownKey = createSignedProof(
      privateKey,
      {
        iss: 'https://appleid.apple.com',
        aud: 'com.misyra.app',
        sub: 'subject',
        nonce: 'nonce-1',
        iat: 1_788_579_600,
        exp: 1_788_580_200,
      },
      { alg: 'RS256', kid: 'unknown-key' },
    );

    await expect(verifier.verify('apple', wrongAlgorithm)).rejects.toBeInstanceOf(
      AuthSecurityError,
    );
    await expect(verifier.verify('apple', unknownKey)).rejects.toBeInstanceOf(AuthSecurityError);
  });
});
