import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSignOutCleanup } from './sign-out-cleanup.js';
import { applyMobileMigrations } from '../storage/schema.js';

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

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

async function seedAccount(database, accountId) {
  await applyMobileMigrations(database);
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    accountId,
    '2026-09-05T00:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO notification_registry
      (account_id, notification_id, occurrence_id, scheduled_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    accountId,
    'notification-a',
    'occurrence-a',
    '2026-09-06T01:00:00.000Z',
    '2026-09-05T00:00:00.000Z',
  );
}

function cleanupHooks() {
  return {
    stopSync: vi.fn(async () => undefined),
    cancelNotifications: vi.fn(async () => undefined),
    clearWorkingMedia: vi.fn(async () => undefined),
    clearFeedbackDraft: vi.fn(async () => undefined),
    clearAppKeys: vi.fn(async () => undefined),
  };
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('MTS-036 sign-out cleanup', () => {
  it('wipes account-scoped SQLite state and invokes private-resource cleanup hooks', async () => {
    const database = createDatabase();
    const accountId = '123e4567-e89b-42d3-a456-426614174000';
    await seedAccount(database, accountId);
    const hooks = cleanupHooks();
    const cleanup = createSignOutCleanup({ openDatabase: async () => database, hooks });

    await cleanup(accountId);

    expect(
      await database.getFirstAsync(
        'SELECT account_id FROM local_accounts WHERE account_id = ?',
        accountId,
      ),
    ).toBeNull();
    expect(
      await database.getFirstAsync(
        'SELECT notification_id FROM notification_registry WHERE account_id = ?',
        accountId,
      ),
    ).toBeNull();
    expect(hooks.stopSync).toHaveBeenCalledWith(accountId);
    expect(hooks.cancelNotifications).toHaveBeenCalledWith(accountId);
    expect(hooks.clearWorkingMedia).toHaveBeenCalledWith(accountId);
    expect(hooks.clearFeedbackDraft).toHaveBeenCalledWith(accountId);
    expect(hooks.clearAppKeys).toHaveBeenCalledWith(accountId);
  });

  it('attempts every private-state cleanup step even when an earlier hook fails', async () => {
    const database = createDatabase();
    const accountId = '123e4567-e89b-42d3-a456-426614174000';
    await seedAccount(database, accountId);
    const hooks = cleanupHooks();
    hooks.cancelNotifications.mockRejectedValueOnce(new Error('notification cleanup failed'));
    const cleanup = createSignOutCleanup({ openDatabase: async () => database, hooks });

    await expect(cleanup(accountId)).rejects.toThrow('notification cleanup failed');

    expect(hooks.stopSync).toHaveBeenCalledWith(accountId);
    expect(hooks.cancelNotifications).toHaveBeenCalledWith(accountId);
    expect(hooks.clearWorkingMedia).toHaveBeenCalledWith(accountId);
    expect(hooks.clearFeedbackDraft).toHaveBeenCalledWith(accountId);
    expect(hooks.clearAppKeys).toHaveBeenCalledWith(accountId);
    expect(
      await database.getFirstAsync(
        'SELECT account_id FROM local_accounts WHERE account_id = ?',
        accountId,
      ),
    ).toBeNull();
  });
});
