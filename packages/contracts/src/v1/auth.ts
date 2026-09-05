import { z } from 'zod';

export const authProviderSchema = z.enum(['apple', 'google']);
export type AuthProvider = z.infer<typeof authProviderSchema>;

export const authProviderExchangeRequestSchema = z
  .object({
    proof: z.string().min(1),
    nonce: z.string().min(1),
  })
  .strict();
export type AuthProviderExchangeRequest = z.infer<typeof authProviderExchangeRequestSchema>;

export const authRefreshRequestSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();
export type AuthRefreshRequest = z.infer<typeof authRefreshRequestSchema>;

export const authSignOutRequestSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();
export type AuthSignOutRequest = z.infer<typeof authSignOutRequestSchema>;

export const authSignOutResponseSchema = z
  .object({
    signedOut: z.literal(true),
  })
  .strict();
export type AuthSignOutResponse = z.infer<typeof authSignOutResponseSchema>;

export const authTokenPairSchema = z
  .object({
    accountId: z.string().uuid(),
    accessToken: z.string().min(1),
    accessTokenExpiresAt: z.string().datetime({ offset: true }),
    refreshToken: z.string().min(1),
    refreshTokenExpiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type AuthTokenPair = z.infer<typeof authTokenPairSchema>;
