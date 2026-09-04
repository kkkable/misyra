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

async function setup() {
  const database = new NodeSqliteAdapter();
  await applyMobileMigrations(database);
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    'account-a',
    '2026-09-04T00:00:00.000Z',
  );
  return database;
}

function mutation(mutationId) {
  return {
    mutationId,
    accountId: 'account-a',
    deviceId: 'device-a',
    entityType: 'mission',
    entityId: `entity-${mutationId}`,
    operation: 'update',
    baseVersion: 1,
    clientOccurredAt: '2026-09-04T18:00:00.000Z',
    payload: {},
  };
}

async function enqueue(queue, mutationId) {
  await queue.enqueue({
    mutation: mutation(mutationId),
    destination: { kind: 'server' },
    applyLocal: async () => {},
  });
}

describe('MTS-031 synchronization ordering invariants', () => {
  it('rejects non-prefix push acceptance instead of settling past an earlier mutation', async () => {
    const database = await setup();
    try {
      const queue = createMutationQueue(database, 'account-a');
      await enqueue(queue, 'first');
      await enqueue(queue, 'second');
      const sync = createServerSync({
        database,
        accountId: 'account-a',
        mutationQueue: queue,
        transport: {
          push: async () => ({ acceptedMutationIds: ['second'] }),
          pull: async () => ({
            kind: 'incremental',
            changes: [],
            nextCursor: 0,
            hasMore: false,
          }),
          snapshot: async () => ({ entries: [], nextCursor: 0 }),
        },
        applyChanges: async () => {},
        applySnapshot: async () => {},
      });

      await expect(sync.run()).rejects.toThrow('contiguous queued prefix');
      expect((await queue.listPending()).map((item) => item.mutation.mutationId)).toEqual([
        'first',
        'second',
      ]);
    } finally {
      database.close();
    }
  });

  it('rejects a pull sequence gap instead of advancing the cursor across unseen changes', async () => {
    const database = await setup();
    try {
      const sync = createServerSync({
        database,
        accountId: 'account-a',
        mutationQueue: createMutationQueue(database, 'account-a'),
        transport: {
          push: async () => ({ acceptedMutationIds: [] }),
          pull: async () => ({
            kind: 'incremental',
            changes: [
              {
                sequence: 2,
                entityType: 'mission',
                entityId: 'mission-a',
                operation: 'upsert',
                payload: {},
              },
            ],
            nextCursor: 2,
            hasMore: false,
          }),
          snapshot: async () => ({ entries: [], nextCursor: 0 }),
        },
        applyChanges: async () => {},
        applySnapshot: async () => {},
      });

      await expect(sync.run()).rejects.toThrow('contiguous');
    } finally {
      database.close();
    }
  });

  it('rolls back snapshot recovery if an unsent mutation disappears during replacement', async () => {
    const database = await setup();
    try {
      const queue = createMutationQueue(database, 'account-a');
      await enqueue(queue, 'unsent');
      const sync = createServerSync({
        database,
        accountId: 'account-a',
        mutationQueue: queue,
        transport: {
          push: async () => ({ acceptedMutationIds: [] }),
          pull: async () => ({
            kind: 'snapshot_required',
            reason: 'expired_cursor',
            nextCursor: 4,
          }),
          snapshot: async () => ({ entries: [], nextCursor: 4 }),
        },
        applyChanges: async () => {},
        applySnapshot: async (transaction) => {
          await transaction.runAsync(
            'DELETE FROM mutation_queue WHERE account_id = ?',
            'account-a',
          );
        },
      });

      await expect(sync.run()).rejects.toThrow('removed an unsent mutation');
      expect((await queue.listPending()).map((item) => item.mutation.mutationId)).toEqual([
        'unsent',
      ]);
    } finally {
      database.close();
    }
  });

  it('serializes overlapping runs so a stale pull cannot move the cursor backward', async () => {
    const database = await setup();
    try {
      let releaseFirstPull;
      const firstPullGate = new Promise((resolve) => {
        releaseFirstPull = resolve;
      });
      let firstPullStarted;
      const firstPullStartedPromise = new Promise((resolve) => {
        firstPullStarted = resolve;
      });
      const requestedCursors = [];
      const sync = createServerSync({
        database,
        accountId: 'account-a',
        mutationQueue: createMutationQueue(database, 'account-a'),
        transport: {
          push: async () => ({ acceptedMutationIds: [] }),
          pull: async ({ cursor }) => {
            requestedCursors.push(cursor);
            if (requestedCursors.length === 1) {
              firstPullStarted();
              await firstPullGate;
            }
            return {
              kind: 'incremental',
              changes: [
                {
                  sequence: cursor + 1,
                  entityType: 'mission',
                  entityId: `mission-${cursor + 1}`,
                  operation: 'upsert',
                  payload: {},
                },
              ],
              nextCursor: cursor + 1,
              hasMore: false,
            };
          },
          snapshot: async () => ({ entries: [], nextCursor: 0 }),
        },
        applyChanges: async () => {},
        applySnapshot: async () => {},
      });

      const firstRun = sync.run();
      await firstPullStartedPromise;
      const secondRun = sync.run();
      await Promise.resolve();
      await Promise.resolve();

      expect(requestedCursors).toEqual([0]);
      releaseFirstPull();
      await Promise.all([firstRun, secondRun]);
      expect(requestedCursors).toEqual([0, 1]);
    } finally {
      database.close();
    }
  });

  it('protects mutations queued while a snapshot request is in flight', async () => {
    const database = await setup();
    try {
      const queue = createMutationQueue(database, 'account-a');
      const sync = createServerSync({
        database,
        accountId: 'account-a',
        mutationQueue: queue,
        transport: {
          push: async () => ({ acceptedMutationIds: [] }),
          pull: async () => ({
            kind: 'snapshot_required',
            reason: 'expired_cursor',
            nextCursor: 4,
          }),
          snapshot: async () => {
            await enqueue(queue, 'late-unsent');
            return { entries: [], nextCursor: 4 };
          },
        },
        applyChanges: async () => {},
        applySnapshot: async (transaction) => {
          await transaction.runAsync(
            'DELETE FROM mutation_queue WHERE account_id = ?',
            'account-a',
          );
        },
      });

      await expect(sync.run()).rejects.toThrow('removed an unsent mutation');
      expect((await queue.listPending()).map((item) => item.mutation.mutationId)).toEqual([
        'late-unsent',
      ]);
    } finally {
      database.close();
    }
  });
});
