import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { MOBILE_SCHEMA_VERSION, applyMobileMigrations } from './schema.js';

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

  all(sql, ...params) {
    return this.database.prepare(sql).all(...params);
  }

  close() {
    this.database.close();
  }
}

const databases = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('MTS-046 general mission note migration', () => {
  it('keeps general notes distinct from Personal Mission Notes in schema version 6', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);

    await applyMobileMigrations(database);

    expect(MOBILE_SCHEMA_VERSION).toBe(6);
    expect(database.all('PRAGMA table_info(search_documents)').map((column) => column.name)).toContain(
      'general_note',
    );

    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      'account-a',
      '2026-09-09T00:00:00.000Z',
    );
    await database.runAsync(
      `INSERT INTO search_documents
        (account_id, document_id, occurrence_id, title, personal_note, general_note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'account-a',
      'document-a',
      'occurrence-a',
      'Mission',
      'Private personal note',
      'General mission note',
      '2026-09-09T00:00:00.000Z',
    );

    expect(
      await database.getFirstAsync(
        `SELECT personal_note, general_note
           FROM search_documents
          WHERE account_id = ? AND document_id = ?`,
        'account-a',
        'document-a',
      ),
    ).toEqual({ personal_note: 'Private personal note', general_note: 'General mission note' });
  });
});
