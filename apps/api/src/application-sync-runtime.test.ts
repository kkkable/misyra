import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApiApplication } from './application.js';

const accountId = '11111111-1111-4111-8111-111111111111';

type FakeQueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
};

describe('MTS-031 executable API synchronization correction', () => {
  const servers: Array<ReturnType<typeof createApiApplication>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('mounts authenticated pull and snapshot routes in the real API application', async () => {
    const query = vi.fn((sql: string): Promise<FakeQueryResult> => {
      if (sql.includes('SELECT max(sequence) AS cursor FROM account_change_log')) {
        return Promise.resolve({ rows: [{ cursor: null }], rowCount: 1 });
      }
      if (sql.includes('SELECT min(sequence) AS sequence FROM account_change_log')) {
        return Promise.resolve({ rows: [{ sequence: null }], rowCount: 1 });
      }
      if (sql.includes('FROM account_change_log') && sql.includes('sequence >')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (sql.includes('WITH ranked AS')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.reject(new Error(`unexpected SQL: ${sql}`));
    });
    const pool = { query } as unknown as Pool;
    const server = createApiApplication({
      pool,
      expectedAudience: { apple: 'apple-audience', google: 'google-audience' },
      issueAccessToken: () => 'fixture-access-token',
      reauthenticationProofSecret: 'fixture-reauthentication-proof-secret',
      verifier: { verify: () => Promise.reject(new Error('not used')) },
      authenticate: () => ({ accountId }),
    });
    servers.push(server);

    const pull = await server.inject({
      method: 'GET',
      url: '/v1/sync/pull?cursor=0&limit=25',
    });
    expect(pull.statusCode).toBe(200);
    expect(pull.json()).toMatchObject({
      ok: true,
      payload: { kind: 'incremental', changes: [], nextCursor: 0, hasMore: false },
    });

    const snapshot = await server.inject({ method: 'GET', url: '/v1/sync/snapshot' });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json()).toMatchObject({
      ok: true,
      payload: { entries: [], nextCursor: 0 },
    });
  });
});
