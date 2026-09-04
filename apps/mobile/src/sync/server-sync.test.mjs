import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { createMutationQueue } from '../storage/mutation-queue.js';
import { applyMobileMigrations } from '../storage/schema.js';
import { createServerSync } from './server-sync.js';

class NodeSqliteAdapter {
  constructor() {
    this.database = new DatabaseSync(':memory:');
  }

  async execAsync(sql) {
    this.database.exec(sql);
  }

  async runAsync(sql, ...params) {
    const result = this.database.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowId: result.lastInsertRowid };
  }

  async getFirstAsync(sql, ...params) {
    return this.database.prepare(sql).get(...params) ?? null;
  }

  async getAllAsync(sql, ...params) {
    return this.database.prepare(sql).all(...params);
  }

  async withExclusiveTransactionAsync(task) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      await task(this);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

const accountId = 'account-a';
const mutation = {
  mutationId: 'mutation-a',
  accountId,
  deviceId: 'device-a',
  entityType: 'mission',
  entityId: '11111111-1111-4111-8111-111111111111',
  operation: 'update',
  baseVersion: 1,
  clientOccurredAt: '2026-09-04T18:00:00.000Z',
  payload: { title: 'Offline edit' },
};

async function createDatabase() {
  const database = new NodeSqliteAdapter();
  await applyMobileMigrations(database);
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    accountId,
    '2026-09-04T00:00:00.000Z',
  );
  return database;
}

async function enqueueServerMutation(database) {
  const queue = createMutationQueue(database, accountId);
  await queue.enqueue({
    mutation,
    destination: { kind: 'server' },
    applyLocal: async () => {},
  });
  return queue;
}

async function readCursor(database) {
  const row = await database.getFirstAsync(
    'SELECT cursor FROM sync_cursors WHERE account_id = ?',
    accountId,
  );
  return row?.cursor ?? null;
}

describe('MTS-031 server synchronization', () => {
  it('settles accepted offline mutations and applies authoritative pull pages in order', async () => {
    const database = await createDatabase();
    try {
      const queue = await enqueueServerMutation(database);
      const applied = [];
      const pushBatches = [];
      const transport = {
        push: async (mutations) => {
          pushBatches.push(mutations.map((item) => item.mutationId));
          return { acceptedMutationIds: mutations.map((item) => item.mutationId) };
        },
        pull: async ({ cursor }) => ({
          kind: 'incremental',
          changes: [
            {
              sequence: cursor + 1,
              entityType: 'mission',
              entityId: 'mission-a',
              operation: 'upsert',
              payload: { version: cursor + 1 },
            },
          ],
          nextCursor: cursor + 1,
          hasMore: false,
        }),
        snapshot: async () => {
          throw new Error('snapshot should not be required');
        },
      };
      const sync = createServerSync({
        database,
        accountId,
        mutationQueue: queue,
        transport,
        applyChanges: async (_transaction, changes) =>
          applied.push(...changes.map((change) => change.sequence)),
        applySnapshot: async () => {},
      });

      await sync.run();

      expect(pushBatches).toEqual([['mutation-a']]);
      expect(await queue.listPending()).toEqual([]);
      expect(applied).toEqual([1]);
      expect(await readCursor(database)).toBe('1');
    } finally {
      database.close();
    }
  });

  it('does not advance the cursor when local authoritative application crashes', async () => {
    const database = await createDatabase();
    try {
      const transport = {
        push: async () => ({ acceptedMutationIds: [] }),
        pull: async () => ({
          kind: 'incremental',
          changes: [
            {
              sequence: 1,
              entityType: 'mission',
              entityId: 'mission-a',
              operation: 'upsert',
              payload: {},
            },
          ],
          nextCursor: 1,
          hasMore: false,
        }),
        snapshot: async () => {
          throw new Error('snapshot should not be required');
        },
      };
      let attempts = 0;
      const sync = createServerSync({
        database,
        accountId,
        mutationQueue: createMutationQueue(database, accountId),
        transport,
        applyChanges: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('simulated crash');
        },
        applySnapshot: async () => {},
      });

      await expect(sync.run()).rejects.toThrow('simulated crash');
      expect(await readCursor(database)).toBeNull();

      await sync.run();
      expect(attempts).toBe(2);
      expect(await readCursor(database)).toBe('1');
    } finally {
      database.close();
    }
  });

  it('paginates pulls without cursor leap', async () => {
    const database = await createDatabase();
    try {
      const requestedCursors = [];
      const applied = [];
      const transport = {
        push: async () => ({ acceptedMutationIds: [] }),
        pull: async ({ cursor }) => {
          requestedCursors.push(cursor);
          const nextCursor = cursor + 1;
          return {
            kind: 'incremental',
            changes: [
              {
                sequence: nextCursor,
                entityType: 'mission',
                entityId: `mission-${nextCursor}`,
                operation: 'upsert',
                payload: {},
              },
            ],
            nextCursor,
            hasMore: nextCursor < 2,
          };
        },
        snapshot: async () => {
          throw new Error('snapshot should not be required');
        },
      };
      const sync = createServerSync({
        database,
        accountId,
        mutationQueue: createMutationQueue(database, accountId),
        transport,
        applyChanges: async (_transaction, changes) =>
          applied.push(...changes.map((change) => change.sequence)),
        applySnapshot: async () => {},
      });

      await sync.run();

      expect(requestedCursors).toEqual([0, 1]);
      expect(applied).toEqual([1, 2]);
      expect(await readCursor(database)).toBe('2');
    } finally {
      database.close();
    }
  });

  it('uses snapshot recovery without dropping unsent mutations', async () => {
    const database = await createDatabase();
    try {
      const queue = await enqueueServerMutation(database);
      let snapshotApplied = false;
      const transport = {
        push: async () => ({ acceptedMutationIds: [] }),
        pull: async () => ({
          kind: 'snapshot_required',
          reason: 'expired_cursor',
          nextCursor: 9,
        }),
        snapshot: async () => ({
          entries: [
            {
              sequence: 9,
              entityType: 'mission',
              entityId: 'mission-a',
              operation: 'upsert',
              payload: {},
            },
          ],
          nextCursor: 9,
        }),
      };
      const sync = createServerSync({
        database,
        accountId,
        mutationQueue: queue,
        transport,
        applyChanges: async () => {},
        applySnapshot: async () => {
          snapshotApplied = true;
        },
      });

      await sync.run();

      expect(snapshotApplied).toBe(true);
      expect((await queue.listPending()).map((item) => item.mutation.mutationId)).toEqual([
        'mutation-a',
      ]);
      expect(await readCursor(database)).toBe('9');
    } finally {
      database.close();
    }
  });
});
