import { createHmac } from 'node:crypto';

import { createPostgresAuthStore } from '@misyra/database';
import type { AuthProvider } from '@misyra/contracts';
import { Pool } from 'pg';

import { createAuthRoutes } from './auth-routes.js';
import { createAuthService, type AccessTokenInput, type ProviderProofVerifier } from './auth.js';
import {
  createApiServer,
  type ApiAuditLog,
  type AuthenticateRequest,
  type ReadinessCheck,
} from './index.js';
import { createProviderProofVerifier } from './provider-proof-verifier.js';

type AuthApplicationOptions = {
  pool: Pool;
  expectedAudience: Record<AuthProvider, string>;
  issueAccessToken: (input: AccessTokenInput) => string | Promise<string>;
  verifier?: ProviderProofVerifier;
  now?: () => Date;
  readiness?: ReadinessCheck;
  authenticate?: AuthenticateRequest;
  auditLog?: ApiAuditLog;
};

const LOCAL_AUTH_DEFAULTS = {
  appleAudience: 'fixture-apple-auth-audience',
  googleAudience: 'fixture-google-auth-audience',
  accessTokenSecret: 'fixture-local-auth-access-token-secret',
} as const;

export function createApiApplication(options: AuthApplicationOptions) {
  const authService = createAuthService({
    store: createPostgresAuthStore(options.pool),
    verifier: options.verifier ?? createProviderProofVerifier(),
    expectedAudience: options.expectedAudience,
    issueAccessToken: options.issueAccessToken,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return createApiServer({
    routes: createAuthRoutes(authService),
    ...(options.readiness === undefined ? {} : { readiness: options.readiness }),
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
    ...(options.auditLog === undefined ? {} : { auditLog: options.auditLog }),
  });
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function localOrRequiredEnv(env: NodeJS.ProcessEnv, name: string, localDefault: string) {
  const value = env[name];
  if (value) return value;
  if (env.NODE_ENV !== 'production') return localDefault;
  return requiredEnv(env, name);
}

export function resolveAuthStartupConfiguration(env: NodeJS.ProcessEnv) {
  return {
    expectedAudience: {
      apple: localOrRequiredEnv(env, 'APPLE_AUTH_AUDIENCE', LOCAL_AUTH_DEFAULTS.appleAudience),
      google: localOrRequiredEnv(env, 'GOOGLE_AUTH_AUDIENCE', LOCAL_AUTH_DEFAULTS.googleAudience),
    },
    accessTokenSecret: localOrRequiredEnv(
      env,
      'AUTH_ACCESS_TOKEN_SECRET',
      LOCAL_AUTH_DEFAULTS.accessTokenSecret,
    ),
  };
}

function databaseUrl(env: NodeJS.ProcessEnv) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const user = encodeURIComponent(env.POSTGRES_USER ?? 'misyra');
  const password = encodeURIComponent(env.POSTGRES_PASSWORD ?? 'misyra-local-only');
  const port = env.POSTGRES_PORT ?? '5432';
  const database = encodeURIComponent(env.POSTGRES_DB ?? 'misyra');
  return `postgresql://${user}:${password}@127.0.0.1:${port}/${database}`;
}

export function createHmacAccessTokenIssuer(secret: string) {
  if (secret.length < 32)
    throw new Error('AUTH_ACCESS_TOKEN_SECRET must be at least 32 characters');
  return (input: AccessTokenInput) => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: input.accountId,
        sid: input.sessionId,
        exp: Math.floor(input.expiresAt.getTime() / 1_000),
      }),
    ).toString('base64url');
    const signature = createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    return `${header}.${payload}.${signature}`;
  };
}

export async function startApiApplication(env: NodeJS.ProcessEnv = process.env) {
  const pool = new Pool({ connectionString: databaseUrl(env) });
  const authConfiguration = resolveAuthStartupConfiguration(env);
  const server = createApiApplication({
    pool,
    expectedAudience: authConfiguration.expectedAudience,
    issueAccessToken: createHmacAccessTokenIssuer(authConfiguration.accessTokenSecret),
  });
  server.addHook('onClose', async () => {
    await pool.end();
  });
  try {
    await server.listen({ host: '127.0.0.1', port: 3000 });
  } catch (error) {
    await pool.end();
    throw error;
  }
  return server;
}
