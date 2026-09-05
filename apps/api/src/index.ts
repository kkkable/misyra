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
};

export type ApiAuditLog = (entry: ApiAuditEntry) => void;

type ApiRouteBase = {
  method: HTTPMethods | HTTPMethods[];
  path: `/${string}`;
  schema?: FastifySchema;
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
  const server = Fastify({
    logger: false,
    genReqId: (request) => {
      const supplied = request.headers['x-request-id'];
      return isUuid(supplied) ? supplied : randomUUID();
    },
  });

  server.addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id);
    done();
  });

  if (options.auditLog) {
    server.addHook('onResponse', (request, reply, done) => {
      options.auditLog?.({
        requestId: request.id,
        method: request.method,
        route: routeLabel(request),
        statusCode: reply.statusCode,
      });
      done();
    });
  }

  server.setErrorHandler((error, request, reply) => {
    const validationError = isValidationError(error);
    const code: ApiErrorCode = validationError
      ? 'validation_failed'
      : error instanceof ApiError
        ? error.code
        : 'temporarily_unavailable';
    const statusCode = validationError ? 400 : errorStatus[code];

    return reply.code(statusCode).send(errorEnvelope(request.id, code));
  });

  server.get('/health/live', () => ({ status: 'ok' as const }));
  server.get('/health/ready', async (_request, reply) => {
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
      for (const route of routes) {
        const routeOptions = {
          method: route.method,
          url: route.path,
          handler: async (request: FastifyRequest, reply: FastifyReply) => {
            let payload: unknown;

            if (route.public) {
              payload = await route.handler(request, reply, null);
            } else {
              const auth = await authenticate(request);
              if (!auth) {
                return reply.code(401).send(errorEnvelope(request.id, 'unauthorized'));
              }
              request.authContext = auth;
              payload = await route.handler(request, reply, auth);
            }

            if (reply.sent) return;
            return successEnvelope(request.id, payload);
          },
          ...(route.schema === undefined ? {} : { schema: route.schema }),
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

export async function startApiServer() {
  const server = createApiServer();
  await server.listen({ host: '127.0.0.1', port: 3000 });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startApiServer();
}
