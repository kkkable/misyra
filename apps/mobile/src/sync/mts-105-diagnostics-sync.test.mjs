import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyMobileMigrations } from '../storage/schema.js';
import { runAuthenticatedServerSync } from './authenticated-sync-runtime.js';

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

const databases = [];
const accountId = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('MTS-105 diagnostics settings sync projection', () => {
  it('applies an authoritative diagnostics opt-out to the local account cache', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);
    await applyMobileMigrations(database);
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at, diagnostics_enabled) VALUES (?, ?, ?)',
      accountId,
      '2026-09-28T05:20:00.000Z',
      1,
    );

    const api = {
      push: vi.fn(() => Promise.resolve({ acceptedMutationIds: [], conflicts: [] })),
      pull: vi.fn(() =>
        Promise.resolve({
          kind: 'incremental',
          changes: [
            {
              sequence: 1,
              entityType: 'settings',
              entityId: accountId,
              operation: 'upsert',
              payload: {
                language: 'en',
                trustMode: false,
                diagnosticsEnabled: false,
              },
            },
          ],
          nextCursor: 1,
          hasMore: false,
        }),
      ),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 1 })),
    };

    await expect(runAuthenticatedServerSync({ database, accountId, api })).resolves.toEqual({
      settledMutations: 0,
      cursor: 1,
    });

    expect(
      await database.getFirstAsync(
        'SELECT diagnostics_enabled FROM local_accounts WHERE account_id = ?',
        accountId,
      ),
    ).toEqual({ diagnostics_enabled: 0 });
  });
});
