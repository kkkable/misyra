import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { createLocalRepositories } from './local-repositories.js';
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

  close() {
    this.database.close();
  }
}

describe('MTS-029 observable read surfaces', () => {
  it('exposes observable queries for every ticket-owned SQLite read surface', async () => {
    const database = new NodeSqliteAdapter();
    try {
      await applyMobileMigrations(database);
      const repositories = createLocalRepositories(database, 'account-a');

      expect(repositories.calendar.observeWindow).toBeTypeOf('function');
      expect(repositories.missions.observeById).toBeTypeOf('function');
      expect(repositories.progress.observeRecent).toBeTypeOf('function');
      expect(repositories.settings.observe).toBeTypeOf('function');
      expect(repositories.settings.observeHiddenEvents).toBeTypeOf('function');
      expect(repositories.drafts.observePlanner).toBeTypeOf('function');
      expect(repositories.drafts.observeStory).toBeTypeOf('function');
      expect(repositories.search.observeDocuments).toBeTypeOf('function');
    } finally {
      database.close();
    }
  });
});
