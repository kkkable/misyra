import { describe, expect, it, vi } from 'vitest';

import { ApiError, createApiServer, type ApiAuditEntry } from './index.js';

type ObservedAuditEntry = ApiAuditEntry &
  Readonly<{
    durationMs?: number;
    outcome?: string;
    errorCode?: string;
  }>;

describe('MTS-105 backend telemetry fields', () => {
  it('emits content-free duration and outcome fields for successful requests', async () => {
    const auditLog = vi.fn<(entry: ApiAuditEntry) => void>();
    const server = createApiServer({
      routes: [
        {
          method: 'POST',
          path: '/feedback',
          handler: () => ({ accepted: true }),
        },
      ],
      authenticate: () => ({ accountId: 'account-1' }),
      auditLog,
    });

    await server.inject({
      method: 'POST',
      url: '/v1/feedback',
      payload: { message: 'private body must not be logged' },
    });

    expect(auditLog).toHaveBeenCalledOnce();
    const entry = auditLog.mock.calls[0]?.[0] as ObservedAuditEntry | undefined;
    expect(entry).toMatchObject({
      method: 'POST',
      route: '/feedback',
      statusCode: 200,
      outcome: 'success',
    });
    expect(entry?.durationMs).toEqual(expect.any(Number));
    expect(entry?.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(entry)).not.toContain('private body must not be logged');

    await server.close();
  });

  it('records stable error code and failure outcome without request content', async () => {
    const auditLog = vi.fn<(entry: ApiAuditEntry) => void>();
    const server = createApiServer({
      routes: [
        {
          method: 'POST',
          path: '/missions/:missionId/complete',
          handler: () => {
            throw new ApiError('already_completed');
          },
        },
      ],
      authenticate: () => ({ accountId: 'account-1' }),
      auditLog,
    });

    await server.inject({
      method: 'POST',
      url: '/v1/missions/private-id/complete',
      payload: { note: 'private mission content' },
    });

    expect(auditLog).toHaveBeenCalledOnce();
    const entry = auditLog.mock.calls[0]?.[0] as ObservedAuditEntry | undefined;
    expect(entry).toMatchObject({
      route: '/missions/:missionId/complete',
      statusCode: 409,
      outcome: 'client_error',
      errorCode: 'already_completed',
    });
    expect(JSON.stringify(entry)).not.toContain('private mission content');

    await server.close();
  });
});
