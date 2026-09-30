import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import { pathToFileURL } from 'node:url';

import {
  apiResponseEnvelopeSchema,
  clientActionErrorCodes,
  type ClientActionError,
} from '@misyra/contracts';
import Fastify, {
  type FastifyReply,
  type FastifyRequest,
  type FastifySchema,
  type HTTPMethods,
} from 'fastify';

import {
  abuseControlClasses,
  routeAbuseControls,
  unversionedRouteAbuseControls,
  type AbuseControlClass,
  type AbuseControlClassName,
} from './abuse-controls.js';

export type ReadinessCheck = () => boolean | Promise<boolean>;

export type AuthContext = {
  accountId: string;
};

export type AuthenticateRequest = (
  request: FastifyRequest,
) => AuthContext | null | Promise<AuthContext | null>;

export type ApiAuditEntry = {
  requestId: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  outcome: 'success' | 'client_error' | 'server_error';
  errorCode?: ApiErrorCode;
};

export type ApiAuditLog = (entry: ApiAuditEntry) => void;

type ApiRouteBase = {
  method: HTTPMethods | HTTPMethods[];
  path: `/${string}`;
  schema?: FastifySchema;
  bodyLimit?: number;
};

export type ApiProtectedRouteDefinition = ApiRouteBase & {
  public?: false;
  handler: (request: FastifyRequest, reply: FastifyReply, auth: AuthContext) => unknown;
};

export type ApiPublicRouteDefinition = ApiRouteBase & {
  public: true;
  handler: (request: FastifyRequest, reply: FastifyReply, auth: null) => unknown;
};

export type ApiRouteDefinition = ApiProtectedRouteDefinition | ApiPublicRouteDefinition;

type ApiServerOptions = {
  readiness?: ReadinessCheck;
  routes?: ApiRouteDefinition[];
  authenticate?: AuthenticateRequest;
  auditLog?: ApiAuditLog;
};

export const apiErrorCodes = clientActionErrorCodes;

export type ApiErrorCode = ClientActionError['code'];

const errorStatus: Record<ApiErrorCode, number> = {
  validation_failed: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  already_completed: 409,
  completion_window_expired: 409,
  evidence_attempt_limit: 409,
  temporarily_unavailable: 503,
};

const retryableCodes = new Set<ApiErrorCode>(['temporarily_unavailable']);

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
  }
}

function resolvePort(value: string | undefined, fallback: number) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : fallback;
}

function probeTcp(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    let settled = false;

    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ready);
    };

    socket.once('connect', () => {
      finish(true);
    });
    socket.once('error', () => {
      finish(false);
    });
    socket.setTimeout(1_000, () => {
      finish(false);
    });
  });
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isValidationError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'validation' in error &&
    Array.isArray((error as { validation?: unknown }).validation)
  );
}

function errorEnvelope(requestId: string, code: ApiErrorCode) {
  return apiResponseEnvelopeSchema.parse({
    version: 1,
    requestId,
    ok: false,
    error: {
      version: 1,
      code,
      retryable: retryableCodes.has(code),
      messageKey: `error.${code}`,
    },
  });
}

function successEnvelope(requestId: string, payload: unknown) {
  return apiResponseEnvelopeSchema.parse({
    version: 1,
    requestId,
    ok: true,
    payload,
  });
}

function routeLabel(request: FastifyRequest) {
  return request.routeOptions.url ?? 'unmatched';
}

type RateWindow = { count: number; resetAt: number };

function routeAbuseClass(method: string, path: string): AbuseControlClassName | undefined {
  const key = `${method.toUpperCase()} ${path}` as keyof typeof routeAbuseControls;
  return routeAbuseControls[key];
}

function requestRateKey(
  control: AbuseControlClass,
  request: FastifyRequest,
  auth: AuthContext | null,
): string | null {
  switch (control.keyedBy) {
    case 'ip':
      return request.ip;
    case 'account':
      return auth?.accountId ?? null;
    case 'channel': {
      const raw = request.headers['x-goog-channel-id'];
      const channelId = Array.isArray(raw) ? raw[0] : raw;
      return typeof channelId === 'string' && channelId.length > 0
        ? channelId
        : `ip:${request.ip}`;
    }
    case 'device':
      return auth?.accountId ?? null;
  }
  return null;
}

function appliedBodyLimit(
  route: ApiRouteDefinition,
  className: AbuseControlClassName | undefined,
): number | undefined {
  const policyLimit =
    className === undefined || abuseControlClasses[className].maxBodyBytes === 0
      ? undefined
      : abuseControlClasses[className].maxBodyBytes;
  if (route.bodyLimit === undefined) return policyLimit;
  if (policyLimit === undefined) return route.bodyLimit;
  return Math.min(route.bodyLimit, policyLimit);
}

export function createLocalReadinessCheck(env: NodeJS.ProcessEnv = process.env): ReadinessCheck {
  const postgresPort = resolvePort(env.POSTGRES_PORT, 5432);
  const azuriteBlobPort = resolvePort(env.AZURITE_BLOB_PORT, 10000);

  return async () => {
    const [postgresReady, azuriteReady] = await Promise.all([
      probeTcp(postgresPort),
      probeTcp(azuriteBlobPort),
    ]);

    return postgresReady && azuriteReady;
  };
}

export function createApiServer(options: ApiServerOptions = {}) {
  const readiness = options.readiness ?? createLocalReadinessCheck();
  const routes = options.routes ?? [];
  const authenticate = options.authenticate ?? (() => null);
  const requestStartedAt = new Map<string, number>();
  const requestErrorCodes = new Map<string, ApiErrorCode>();
  const rateWindows = new Map<string, RateWindow>();

  const enforceRateLimit = (
    className: AbuseControlClassName,
    request: FastifyRequest,
    reply: FastifyReply,
    auth: AuthContext | null,
  ) => {
    const control = abuseControlClasses[className];
    const key = requestRateKey(control, request, auth);
    if (key === null) return false;
    const now = Date.now();
    const windowKey = `${className}:${key}`;
    const current = rateWindows.get(windowKey);
    if (current === undefined || current.resetAt <= now) {
      rateWindows.set(windowKey, {
        count: 1,
        resetAt: now + control.windowSeconds * 1_000,
      });
      return true;
    }
    if (current.count >= control.maxRequests) {
      reply.header('retry-after', String(Math.max(1, Math.ceil((current.resetAt - now) / 1_000))));
      reply.code(429).send(errorEnvelope(request.id, 'temporarily_unavailable'));
      return false;
    }
    current.count += 1;
    return true;
  };
  const server = Fastify({
    logger: false,
    routerOptions: {
      maxParamLength: 1024,
    },
    genReqId: (request) => {
      const supplied = request.headers['x-request-id'];
      return isUuid(supplied) ? supplied : randomUUID();
    },
  });

  server.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_request, body, done) => {
      done(null, body);
    },
  );

  server.addContentTypeParser(
    /^multipart\/form-data(?:;.*)?$/i,
    { parseAs: 'buffer' },
    (_request, body, done) => {
      done(null, body);
    },
  );

  server.addHook('onRequest', (request, reply, done) => {
    if (options.auditLog !== undefined) requestStartedAt.set(request.id, Date.now());
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('cache-control', 'no-store');
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    done();
  });

  if (options.auditLog) {
    server.addHook('onResponse', (request, reply, done) => {
      const startedAt = requestStartedAt.get(request.id) ?? Date.now();
      const errorCode = requestErrorCodes.get(request.id);
      const outcome =
        reply.statusCode >= 500
          ? 'server_error'
          : reply.statusCode >= 400
            ? 'client_error'
            : 'success';
      options.auditLog?.({
        requestId: request.id,
        method: request.method,
        route: routeLabel(request),
        statusCode: reply.statusCode,
        durationMs: Math.max(0, Date.now() - startedAt),
        outcome,
        ...(errorCode === undefined ? {} : { errorCode }),
      });
      requestStartedAt.delete(request.id);
      requestErrorCodes.delete(request.id);
      done();
    });
  }

  server.setErrorHandler((error, request, reply) => {
    const bodyTooLarge =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'FST_ERR_CTP_BODY_TOO_LARGE';
    const validationError = bodyTooLarge || isValidationError(error);
    const code: ApiErrorCode = validationError
      ? 'validation_failed'
      : error instanceof ApiError
        ? error.code
        : 'temporarily_unavailable';
    const statusCode = bodyTooLarge ? 413 : validationError ? 400 : errorStatus[code];
    if (options.auditLog !== undefined) requestErrorCodes.set(request.id, code);

    return reply.code(statusCode).send(errorEnvelope(request.id, code));
  });

  server.get('/health/live', (request, reply) => {
    const className = unversionedRouteAbuseControls['GET /health/live'];
    if (!enforceRateLimit(className, request, reply, null)) return;
    return { status: 'ok' as const };
  });
  server.get('/health/ready', async (request, reply) => {
    const className = unversionedRouteAbuseControls['GET /health/ready'];
    if (!enforceRateLimit(className, request, reply, null)) return;
    let ready: boolean;

    try {
      ready = await readiness();
    } catch {
      ready = false;
    }

    if (!ready) {
      return reply.code(503).send({ status: 'not_ready' as const });
    }

    return { status: 'ready' as const };
  });

  void server.register(
    (v1, _pluginOptions, done) => {
      const authenticateProtected = async (request: FastifyRequest, reply: FastifyReply) => {
        const auth = await authenticate(request);
        if (!auth) {
          return reply.code(401).send(errorEnvelope(request.id, 'unauthorized'));
        }
        request.authContext = auth;
      };

      for (const route of routes) {
        const className =
          typeof route.method === 'string' ? routeAbuseClass(route.method, route.path) : undefined;
        const bodyLimit = appliedBodyLimit(route, className);
        const routeOptions = {
          method: route.method,
          url: route.path,
          ...(route.public ? {} : { onRequest: authenticateProtected }),
          handler: async (request: FastifyRequest, reply: FastifyReply) => {
            let payload: unknown;

            if (route.public) {
              if (className !== undefined && !enforceRateLimit(className, request, reply, null)) {
                return;
              }
              payload = await route.handler(request, reply, null);
            } else {
              const auth = request.authContext;
              if (!auth) {
                return reply.code(401).send(errorEnvelope(request.id, 'unauthorized'));
              }
              if (className !== undefined && !enforceRateLimit(className, request, reply, auth)) {
                return;
              }
              payload = await route.handler(request, reply, auth);
            }

            if (reply.sent) return;
            return successEnvelope(request.id, payload);
          },
          ...(route.schema === undefined ? {} : { schema: route.schema }),
          ...(bodyLimit === undefined ? {} : { bodyLimit }),
        };
        v1.route(routeOptions);
      }
      done();
    },
    { prefix: '/v1' },
  );

  return server;
}

declare module 'fastify' {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}

export async function startApiServer(env: NodeJS.ProcessEnv = process.env) {
  const { startApiApplication } = await import('./application.js');
  return startApiApplication(env);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startApiServer();
}

export * from './authoritative-completion.js';
