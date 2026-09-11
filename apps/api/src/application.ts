import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  createPostgresAuthStore,
  createPostgresDeviceSettingsStore,
  deleteAccountTransaction,
} from '@misyra/database';
import type { AuthProvider } from '@misyra/contracts';
import { Pool } from 'pg';

import {
  createAccountLifecycleService,
  createHmacReauthenticationProofCodec,
} from './account-lifecycle.js';
import { createAccountLifecycleRoutes } from './account-lifecycle-routes.js';
import { createAuthRoutes } from './auth-routes.js';
import { createAuthService, type AccessTokenInput, type ProviderProofVerifier } from './auth.js';
import { createCompletionRoutes } from './completion-routes.js';
import { createDeviceSettingsRoutes } from './device-settings-routes.js';
import { createDeviceSettingsService } from './device-settings.js';
import {
  createApiServer,
  type ApiAuditLog,
  type AuthenticateRequest,
  type ReadinessCheck,
} from './index.js';
import { createProviderProofVerifier } from './provider-proof-verifier.js';
import { createSyncRoutes } from './sync-routes.js';
import { createPostgresSyncService } from './sync-service.js';

type AuthApplicationOptions = {
  pool: Pool;
  expectedAudience: Record<AuthProvider, string>;
  issueAccessToken: (input: AccessTokenInput) => string | Promise<string>;
  reauthenticationProofSecret: string;
  verifier?: ProviderProofVerifier;
  now?: () => Date;
  readiness?: ReadinessCheck;
  authenticate?: AuthenticateRequest;
  auditLog?: ApiAuditLog;
};

type SessionActiveCheck = (
  accountId: string,
  sessionId: string,
  now: Date,
) => boolean | Promise<boolean>;

const LOCAL_AUTH_DEFAULTS = {
  appleAudience: 'fixture-apple-auth-audience',
  googleAudience: 'fixture-google-auth-audience',
  accessTokenSecret: 'fixture-local-auth-access-token-secret',
} as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createApiApplication(options: AuthApplicationOptions) {
  const authStore = createPostgresAuthStore(options.pool);
  const deviceSettingsStore = createPostgresDeviceSettingsStore(options.pool);
  const verifier = options.verifier ?? createProviderProofVerifier();
  const reauthenticationProofCodec = createHmacReauthenticationProofCodec(
    options.reauthenticationProofSecret,
  );
  const authService = createAuthService({
    store: authStore,
    verifier,
    expectedAudience: options.expectedAudience,
    issueAccessToken: options.issueAccessToken,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const accountLifecycleService = createAccountLifecycleService({
    identityStore: authStore,
    verifier,
    expectedAudience: options.expectedAudience,
    issueReauthenticationProof: (claims) => reauthenticationProofCodec.issue(claims),
    verifyReauthenticationProof: (proof) => reauthenticationProofCodec.verify(proof),
    deleteAccount: (accountId) => deleteAccountTransaction(options.pool, accountId),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const deviceSettingsService = createDeviceSettingsService(deviceSettingsStore);
  const syncService = createPostgresSyncService(options.pool);

  return createApiServer({
    routes: [
      ...createAuthRoutes(authService),
      ...createAccountLifecycleRoutes(accountLifecycleService),
      ...createDeviceSettingsRoutes(deviceSettingsService),
      ...createCompletionRoutes(options.pool),
      ...createSyncRoutes(syncService),
    ],
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
