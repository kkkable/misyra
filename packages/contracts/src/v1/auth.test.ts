import { describe, expect, it } from 'vitest';

import {
  authProviderExchangeRequestSchema,
  authRefreshRequestSchema,
  authTokenPairSchema,
} from './auth.js';

describe('shared v1 authentication contracts', () => {
  it('rejects unknown request fields and validates token pairs', () => {
    expect(
      authProviderExchangeRequestSchema.safeParse({
        proof: 'proof',
        nonce: 'nonce',
        ignored: 'not-allowed',
      }).success,
    ).toBe(false);
    expect(
      authRefreshRequestSchema.safeParse({
        refreshToken: 'refresh',
        ignored: 'not-allowed',
      }).success,
    ).toBe(false);
    expect(
      authTokenPairSchema.safeParse({
        accountId: '123e4567-e89b-42d3-a456-426614174000',
        accessToken: 'fixture-access-value',
        accessTokenExpiresAt: '2026-09-05T08:45:00.000Z',
        refreshToken: 'refresh',
        refreshTokenExpiresAt: '2026-10-05T08:30:00.000Z',
      }).success,
    ).toBe(true);
  });
});
