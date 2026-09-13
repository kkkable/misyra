import { createHmac, timingSafeEqual } from 'node:crypto';

import type { AuthProvider } from '@misyra/contracts';
import {
  createPostgresAuthStore,
  createPostgresDeviceSettingsStore,
  createPostgresGoogleCalendarConnectionStore,
  createPostgresGoogleCalendarSyncStore,
  deleteAccountTransaction,
  type PostgresGoogleCalendarSyncStore,
} from '@misyra/database';
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
  createGoogleCalendarConnectionService,
  type GoogleCalendarOAuthGateway,
  type GoogleCalendarTokenCipher,
} from './google-calendar-connection.js';
import { createGoogleCalendarOAuthGateway } from './google-calendar-oauth-gateway.js';
import { createGoogleCalendarRoutes } from './google-calendar-routes.js';
import {
  createGoogleCalendarSyncService,
  type GoogleCalendarSynchronizationProvider,
} from './google-calendar-sync.js';
import { createGoogleCalendarSyncProvider } from './google-calendar-sync-provider.js';
import { createGoogleCalendarTokenCipher } from './google-calendar-token-cipher.js';
import {
  createApiServer,
  type ApiAuditLog,
  type AuthenticateRequest,
  type ReadinessCheck,
} from './index.js';
import { createProviderProofVerifier } from './provider-proof-verifier.js';
import { createSyncRoutes } from './sync-routes.js';
import { createPostgresSyncService } from './sync-service.js';

type GoogleCalendarApplicationDependencies = Readonly<{
  provider: GoogleCalendarOAuthGateway;
  cipher: GoogleCalendarTokenCipher;
  syncProvider?: GoogleCalendarSynchronizationProvider;
}>;

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
  googleCalendar?: GoogleCalendarApplicationDependencies;
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
const LOCAL_GOOGLE_CALENDAR_DEFAULTS = {
  clientId: 'fixture-google-calendar-client-id',
  clientSecret: 'fixture-google-calendar-client-secret',
  redirectUri: 'http://127.0.0.1:3000/v1/calendars/google/callback',
  encryptionKey: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc',
} as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createGoogleCalendarSyncSessionLoader(
  store: Pick<PostgresGoogleCalendarSyncStore, 'loadEncryptedSession'>,
  cipher: GoogleCalendarTokenCipher,
) {
  return async (connectionId: string) => {
    const session = await store.loadEncryptedSession(connectionId);
    if (session === null) return null;
    return {
      providerCalendarId: session.providerCalendarId,
      refreshToken: await cipher.decrypt(session.encryptedRefreshToken),
      cursor: session.cursor,
      timeZone: session.timeZone,
    };
  };
}

export function createApiApplication(options: AuthApplicationOptions) {
  const authStore = createPostgresAuthStore(options.pool);
  const deviceSettingsStore = createPostgresDeviceSettingsStore(options.pool);
  const verifier = options.verifier ?? createProviderProofVerifier();
  const reauthenticationProofCodec = createHmacReauthenticationProofCodec(
    options.reauthenticationProofSecret,
  );
  const googleCalendarService =
    options.googleCalendar === undefined
      ? undefined
      : createGoogleCalendarConnectionService({
          store: createPostgresGoogleCalendarConnectionStore(options.pool),
          provider: options.googleCalendar.provider,
          cipher: options.googleCalendar.cipher,
          ...(options.now === undefined ? {} : { now: options.now }),
        });
  const googleCalendarSyncService =
    options.googleCalendar?.syncProvider === undefined
      ? undefined
      : createGoogleCalendarSyncService({
          store: createPostgresGoogleCalendarSyncStore(options.pool),
          provider: options.googleCalendar.syncProvider,
        });
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
    ...(googleCalendarService === undefined
      ? {}
      : {
          beforeDeleteAccount: (accountId: string) =>
            googleCalendarService.disconnectAccount(accountId),
        }),
    deleteAccount: (accountId) => deleteAccountTransaction(options.pool, accountId),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const deviceSettingsService = createDeviceSettingsService(deviceSettingsStore);
  const syncService = createPostgresSyncService(options.pool);
  const googleCalendarRoutes =
    googleCalendarService === undefined
      ? []
      : createGoogleCalendarRoutes(googleCalendarService, googleCalendarSyncService);

  return createApiServer({
    routes: [
      ...createAuthRoutes(authService),
      ...createAccountLifecycleRoutes(accountLifecycleService),
      ...createDeviceSettingsRoutes(deviceSettingsService),
      ...createCompletionRoutes(options.pool),
      ...createSyncRoutes(syncService),
      ...googleCalendarRoutes,
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

export function resolveGoogleCalendarStartupConfiguration(env: NodeJS.ProcessEnv) {
  const clientId = localOrRequiredEnv(
    env,
    'GOOGLE_CALENDAR_CLIENT_ID',
    LOCAL_GOOGLE_CALENDAR_DEFAULTS.clientId,
  );
  const clientSecret = localOrRequiredEnv(
    env,
    'GOOGLE_CALENDAR_CLIENT_SECRET',
    LOCAL_GOOGLE_CALENDAR_DEFAULTS.clientSecret,
  );
  const redirectUri = localOrRequiredEnv(
    env,
    'GOOGLE_CALENDAR_REDIRECT_URI',
    LOCAL_GOOGLE_CALENDAR_DEFAULTS.redirectUri,
  );
  const encodedEncryptionKey = localOrRequiredEnv(
    env,
    'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY',
    LOCAL_GOOGLE_CALENDAR_DEFAULTS.encryptionKey,
  );
  const encryptionKey = Buffer.from(encodedEncryptionKey, 'base64url');
  if (
    !/^[A-Za-z0-9_-]+$/.test(encodedEncryptionKey) ||
    encryptionKey.length !== 32 ||
    encryptionKey.toString('base64url') !== encodedEncryptionKey
  ) {
    throw new Error('GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must be a 32-byte base64url value');
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    encryptionKey,
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

function hmacSignatureMatches(secret: string, signedValue: string, suppliedSignature: string) {
  const expected = Buffer.from(
    createHmac('sha256', secret).update(signedValue).digest('base64url'),
  );
  const supplied = Buffer.from(suppliedSignature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function createHmacAccessTokenAuthenticator(
  secret: string,
  isSessionActive: SessionActiveCheck,
  now: () => Date = () => new Date(),
): AuthenticateRequest {
  if (secret.length < 32)
    throw new Error('AUTH_ACCESS_TOKEN_SECRET must be at least 32 characters');

  return async (request) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) return null;

    const token = authorization.slice('Bearer '.length);
    const [headerSegment, payloadSegment, signatureSegment, ...extra] = token.split('.');
    if (!headerSegment || !payloadSegment || !signatureSegment || extra.length > 0) return null;
    if (!hmacSignatureMatches(secret, `${headerSegment}.${payloadSegment}`, signatureSegment)) {
      return null;
    }

    try {
      const header = JSON.parse(Buffer.from(headerSegment, 'base64url').toString('utf8')) as {
        alg?: unknown;
        typ?: unknown;
      };
      const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as {
        sub?: unknown;
        sid?: unknown;
        exp?: unknown;
      };
      if (
        header.alg !== 'HS256' ||
        header.typ !== 'JWT' ||
        typeof payload.sub !== 'string' ||
        !UUID_PATTERN.test(payload.sub) ||
        typeof payload.sid !== 'string' ||
        !UUID_PATTERN.test(payload.sid) ||
        typeof payload.exp !== 'number' ||
        !Number.isFinite(payload.exp)
      ) {
        return null;
      }

      const currentTime = now();
      if (payload.exp * 1_000 <= currentTime.getTime()) return null;
      if (!(await isSessionActive(payload.sub, payload.sid, currentTime))) return null;
      return { accountId: payload.sub };
    } catch {
      return null;
    }
  };
}

export async function startApiApplication(env: NodeJS.ProcessEnv = process.env) {
  const pool = new Pool({ connectionString: databaseUrl(env) });
  const authConfiguration = resolveAuthStartupConfiguration(env);
  const googleCalendarConfiguration = resolveGoogleCalendarStartupConfiguration(env);
  const authStore = createPostgresAuthStore(pool);
  const googleCalendarCipher = createGoogleCalendarTokenCipher(
    googleCalendarConfiguration.encryptionKey,
  );
  const googleCalendarSyncStore = createPostgresGoogleCalendarSyncStore(pool);
  const googleCalendarSyncProvider = createGoogleCalendarSyncProvider({
    clientId: googleCalendarConfiguration.clientId,
    clientSecret: googleCalendarConfiguration.clientSecret,
    loadSession: createGoogleCalendarSyncSessionLoader(googleCalendarSyncStore, googleCalendarCipher),
  });
  const server = createApiApplication({
    pool,
    expectedAudience: authConfiguration.expectedAudience,
    issueAccessToken: createHmacAccessTokenIssuer(authConfiguration.accessTokenSecret),
    reauthenticationProofSecret: authConfiguration.accessTokenSecret,
    authenticate: createHmacAccessTokenAuthenticator(
      authConfiguration.accessTokenSecret,
      (accountId, sessionId, currentTime) =>
        authStore.isSessionActive(accountId, sessionId, currentTime),
    ),
    googleCalendar: {
      provider: createGoogleCalendarOAuthGateway({
        clientId: googleCalendarConfiguration.clientId,
        clientSecret: googleCalendarConfiguration.clientSecret,
        redirectUri: googleCalendarConfiguration.redirectUri,
      }),
      cipher: googleCalendarCipher,
      syncProvider: googleCalendarSyncProvider,
    },
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
