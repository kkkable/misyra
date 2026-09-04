import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { createMutationQueue } from './mutation-queue.js';
import { applyMobileMigrations } from './schema.js';

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
}

function mutation(mutationId) {
  return {
    mutationId,
    accountId: 'account-a',
    deviceId: 'device-a',
    entityType: 'mission',
    entityId: 'mission-a',
    operation: 'update',
    baseVersion: 3,
    clientOccurredAt: '2026-09-04T00:00:00.000Z',
    payload: { title: 'Updated offline' },
  };
}

describe('MTS-030 specified mutation envelope', () => {
  it('persists the technical-spec SyncMutation fields without inventing a parallel command shape', async () => {
    const database = new NodeSqliteAdapter();
    try {
      await applyMobileMigrations(database);
      await database.runAsync(
        'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
        'account-a',
        '2026-09-04T00:00:00.000Z',
      );
      const queue = createMutationQueue(database, 'account-a');
      const envelope = mutation('mutation-contract');

      await queue.enqueue({
        mutation: envelope,
        destination: { kind: 'server' },
        applyLocal: async () => {},
      });

      expect(await queue.listPending()).toEqual([
        {
          sequence: 1,
          mutation: envelope,
          destination: { kind: 'server' },
        },
      ]);
    } finally {
      database.database.close();
    }
  });
});
