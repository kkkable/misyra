import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import { pathToFileURL } from 'node:url';

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

export type ApiRouteDefinition = {
  method: HTTPMethods | HTTPMethods[];
  path: `/${string}`;
  schema?: FastifySchema;
  handler: (request: FastifyRequest, reply: FastifyReply, auth: AuthContext) => unknown;
};

type ApiServerOptions = {
  readiness?: ReadinessCheck;
  routes?: ApiRouteDefinition[];
  authenticate?: AuthenticateRequest;
  auditLog?: ApiAuditLog;
};

export const apiErrorCodes = [
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'already_completed',
  'completion_window_expired',
  'evidence_attempt_limit',
  'temporarily_unavailable',
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

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

function errorEnvelope(requestId: string, code: ApiErrorCode) {
  return {
    version: 1 as const,
    requestId,
    ok: false as const,
    error: {
      version: 1 as const,
      code,
      retryable: retryableCodes.has(code),
      messageKey: `error.${code}`,
    },
  };
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
    const validationError = 'validation' in error && Array.isArray(error.validation);
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
      v1.addHook('onRequest', async (request, reply) => {
        const auth = await authenticate(request);
        if (!auth) {
          return reply.code(401).send(errorEnvelope(request.id, 'unauthorized'));
        }
        request.authContext = auth;
      });

      for (const route of routes) {
        v1.route({
          method: route.method,
          url: route.path,
          schema: route.schema,
          handler: (request, reply) => {
            const auth = request.authContext;
            if (!auth) {
              return reply.code(401).send(errorEnvelope(request.id, 'unauthorized'));
            }
            return route.handler(request, reply, auth);
          },
        });
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
