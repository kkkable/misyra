import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { createOfflineCalendarSearch } from './offline-search.js';
import { applyMobileMigrations } from '../storage/schema.js';

class NodeSqliteAdapter {
  constructor() {
    this.database = new DatabaseSync(':memory:');
  }

  async execAsync(sql) {
    this.database.exec(sql);
  }

  async runAsync(sql, ...params) {
    return this.database.prepare(sql).run(...params);
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

describe('general mission note search projection', () => {
  it('searches general notes while reserving personal-note excerpts for Personal Mission Notes', async () => {
    const database = new NodeSqliteAdapter();
    await applyMobileMigrations(database);
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      'account-a',
      '2026-09-09T00:00:00.000Z',
    );
    await database.runAsync(
      `INSERT INTO search_documents
        (account_id, document_id, occurrence_id, title, location, provider_text, personal_note, general_note, updated_at)
       VALUES (?, ?, NULL, ?, NULL, NULL, ?, ?, ?)`,
      'account-a',
      'general-note',
      'Mission',
      'private phrase',
      'bring passport documents',
      '2026-09-09T00:00:00.000Z',
    );

    const search = createOfflineCalendarSearch(database, 'account-a');
    await expect(search.query('passport')).resolves.toEqual([
      expect.objectContaining({
        documentId: 'general-note',
        personalNoteExcerpt: null,
      }),
    ]);
    await expect(search.query('private')).resolves.toEqual([
      expect.objectContaining({
        documentId: 'general-note',
        personalNoteExcerpt: expect.stringContaining('private phrase'),
      }),
    ]);
  });
});
