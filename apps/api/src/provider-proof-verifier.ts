import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';

import {
  AuthSecurityError,
  type AuthProvider,
  type ProviderProofVerifier,
  type VerifiedProviderProof,
} from './auth.js';

type JsonObject = Record<string, unknown>;

type ProviderProofVerifierOptions = {
  jwksUrl?: Record<AuthProvider, string>;
  fetchJson?: (url: string) => Promise<unknown>;
};

const DEFAULT_JWKS_URL: Record<AuthProvider, string> = {
  apple: 'https://appleid.apple.com/auth/keys',
  google: 'https://www.googleapis.com/oauth2/v3/certs',
};

function fail(): never {
  throw new AuthSecurityError('invalid_provider_proof');
}

function parseJsonSegment(segment: string): JsonObject {
  try {
    const parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) fail();
    return parsed as JsonObject;
  } catch (error) {
    if (error instanceof AuthSecurityError) throw error;
    return fail();
  }
}

function requiredString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : fail();
}

function requiredNumericDate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1_000) : fail();
}

function parseAudience(value: unknown) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && value.length === 1) return requiredString(value[0]);
  return fail();
}

function parseVerifiedClaims(provider: AuthProvider, payload: JsonObject): VerifiedProviderProof {
  const email = payload.email;
  return {
    provider,
    subject: requiredString(payload.sub),
    issuer: requiredString(payload.iss),
    audience: parseAudience(payload.aud),
    nonce: requiredString(payload.nonce),
    issuedAt: requiredNumericDate(payload.iat),
    expiresAt: requiredNumericDate(payload.exp),
    ...(typeof email === 'string' ? { email } : {}),
  };
}

function parseJwks(value: unknown) {
  if (typeof value !== 'object' || value === null || !('keys' in value)) return fail();
  const keys = (value as { keys?: unknown }).keys;
  if (!Array.isArray(keys)) return fail();
  return keys;
}

async function defaultFetchJson(url: string) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) fail();
  return response.json() as Promise<unknown>;
}

export function createProviderProofVerifier(
  options: ProviderProofVerifierOptions = {},
): ProviderProofVerifier {
  const jwksUrl = options.jwksUrl ?? DEFAULT_JWKS_URL;
  const fetchJson = options.fetchJson ?? defaultFetchJson;

  return {
    async verify(provider, proof) {
      const segments = proof.split('.');
      if (segments.length !== 3) return fail();
      const [headerSegment, payloadSegment, signatureSegment] = segments;
      if (!headerSegment || !payloadSegment || !signatureSegment) return fail();

      const header = parseJsonSegment(headerSegment);
      if (header.alg !== 'RS256') return fail();
      const keyId = requiredString(header.kid);
      const keys = parseJwks(await fetchJson(jwksUrl[provider]));
      const jwk = keys.find(
        (candidate): candidate is JsonWebKey & { kid: string } =>
          typeof candidate === 'object' &&
          candidate !== null &&
          'kid' in candidate &&
          (candidate as { kid?: unknown }).kid === keyId,
      );
      if (!jwk || ('alg' in jwk && jwk.alg !== undefined && jwk.alg !== 'RS256')) return fail();

      let verified = false;
      try {
        const key = createPublicKey({ key: jwk, format: 'jwk' });
        verified = verify(
          'RSA-SHA256',
          Buffer.from(`${headerSegment}.${payloadSegment}`),
          key,
          Buffer.from(signatureSegment, 'base64url'),
        );
      } catch {
        return fail();
      }
      if (!verified) return fail();

      return parseVerifiedClaims(provider, parseJsonSegment(payloadSegment));
    },
  };
}
