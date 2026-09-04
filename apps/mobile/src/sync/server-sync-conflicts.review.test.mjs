import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it, vi } from 'vitest';

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

it('settles conflicted mutations and delivers conflict outcomes after authoritative pull application', async () => {
  const database = new NodeSqliteAdapter();
  try {
    await applyMobileMigrations(database);
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      'account-a',
      '2026-09-04T00:00:00.000Z',
    );
    const queue = createMutationQueue(database, 'account-a');
    await queue.enqueue({
      mutation: {
        mutationId: 'mutation-a',
        accountId: 'account-a',
        deviceId: 'device-a',
        entityType: 'mission',
        entityId: 'mission-a',
        operation: 'update',
        baseVersion: 1,
        clientOccurredAt: '2026-09-04T23:00:00.000Z',
        payload: { title: 'losing edit' },
      },
      destination: { kind: 'server' },
      applyLocal: async () => {},
    });

    const order = [];
    const applyConflicts = vi.fn(async (conflicts) => order.push(['conflict', conflicts]));
    const sync = createServerSync({
      database,
      accountId: 'account-a',
      mutationQueue: queue,
      transport: {
        push: async () => ({
          acceptedMutationIds: [],
          conflicts: [
            { kind: 'mission_updated', mutationId: 'mutation-a', missionId: 'mission-a' },
          ],
        }),
        pull: async ({ cursor }) => ({
          kind: 'incremental',
          changes: [
            {
              sequence: cursor + 1,
              entityType: 'mission',
              entityId: 'mission-a',
              operation: 'upsert',
              payload: { title: 'authoritative' },
            },
          ],
          nextCursor: cursor + 1,
          hasMore: false,
        }),
        snapshot: async () => {
          throw new Error('snapshot not expected');
        },
      },
      applyChanges: async () => order.push(['changes']),
      applySnapshot: async () => {},
      applyConflicts,
    });

    await sync.run();

    expect(await queue.listPending()).toEqual([]);
    expect(order[0]).toEqual(['changes']);
    expect(order[1][0]).toBe('conflict');
    expect(applyConflicts).toHaveBeenCalledWith([
      { kind: 'mission_updated', mutationId: 'mutation-a', missionId: 'mission-a' },
    ]);
  } finally {
    database.close();
  }
});
