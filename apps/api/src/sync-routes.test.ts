import { afterEach, describe, expect, it } from 'vitest';

import { createApiServer } from './index.js';
import { createSyncRoutes } from './sync-routes.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const otherAccountId = '22222222-2222-4222-8222-222222222222';
const mutation = {
  mutationId: '33333333-3333-4333-8333-333333333333',
  accountId,
  deviceId: '44444444-4444-4444-8444-444444444444',
  entityType: 'mission' as const,
  entityId: '55555555-5555-4555-8555-555555555555',
  operation: 'update' as const,
  baseVersion: 1,
  clientOccurredAt: '2026-09-04T18:00:00.000Z',
  payload: { title: 'Offline edit' },
};

describe('MTS-031 sync routes', () => {
  const servers: Array<ReturnType<typeof createApiServer>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('authenticates push and scopes mutations to the authenticated account', async () => {
    const pushed: string[] = [];
    const server = createApiServer({
      authenticate: () => ({ accountId }),
      routes: createSyncRoutes({
        push: (_accountId, mutations) => {
          pushed.push(...mutations.map((item) => item.mutationId));
          return Promise.resolve({
            acceptedMutationIds: mutations.map((item) => item.mutationId),
          });
        },
        pull: () =>
          Promise.resolve({
            kind: 'incremental',
            changes: [],
            nextCursor: 0,
            hasMore: false,
          }),
        snapshot: () => Promise.resolve({ entries: [], nextCursor: 0 }),
      }),
    });
    servers.push(server);

    const response = await server.inject({
      method: 'POST',
      url: '/v1/sync/push',
      payload: { mutations: [mutation] },
    });

    expect(response.statusCode).toBe(200);
    expect(pushed).toEqual([mutation.mutationId]);

    const forbidden = await server.inject({
      method: 'POST',
      url: '/v1/sync/push',
      payload: { mutations: [{ ...mutation, accountId: otherAccountId }] },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('rejects malformed database-backed mutation identifiers at the request boundary', async () => {
    const server = createApiServer({
      authenticate: () => ({ accountId }),
      routes: createSyncRoutes({
        push: () => Promise.resolve({ acceptedMutationIds: [] }),
        pull: () =>
          Promise.resolve({
            kind: 'incremental',
            changes: [],
            nextCursor: 0,
            hasMore: false,
          }),
        snapshot: () => Promise.resolve({ entries: [], nextCursor: 0 }),
      }),
    });
    servers.push(server);

    for (const malformed of [
      { ...mutation, mutationId: 'not-a-uuid' },
      { ...mutation, accountId: 'not-a-uuid' },
      { ...mutation, deviceId: 'not-a-uuid' },
      { ...mutation, entityId: 'not-a-uuid' },
    ]) {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/sync/push',
        payload: { mutations: [malformed] },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('passes authenticated cursor pagination and snapshot requests to the sync service', async () => {
    const pulls: Array<{ accountId: string; cursor: number; limit: number }> = [];
    const snapshots: string[] = [];
    const server = createApiServer({
      authenticate: () => ({ accountId }),
      routes: createSyncRoutes({
        push: () => Promise.resolve({ acceptedMutationIds: [] }),
        pull: (authenticatedAccountId, input) => {
          pulls.push({ accountId: authenticatedAccountId, ...input });
          return Promise.resolve({
            kind: 'incremental',
            changes: [],
            nextCursor: input.cursor,
            hasMore: false,
          });
        },
        snapshot: (authenticatedAccountId) => {
          snapshots.push(authenticatedAccountId);
          return Promise.resolve({ entries: [], nextCursor: 7 });
        },
      }),
    });
    servers.push(server);

    const pull = await server.inject({
      method: 'GET',
      url: '/v1/sync/pull?cursor=6&limit=25',
    });
    expect(pull.statusCode).toBe(200);
    expect(pulls).toEqual([{ accountId, cursor: 6, limit: 25 }]);

    const snapshot = await server.inject({ method: 'GET', url: '/v1/sync/snapshot' });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshots).toEqual([accountId]);
  });
});
