import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import {
  MOBILE_SCHEMA_VERSION,
  applyMigrations,
  applyMobileMigrations,
  mobileMigrations,
} from './schema.js';

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

  it('moves v5 general mission notes without altering Personal Mission Notes', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);
    await database.execAsync('PRAGMA foreign_keys = ON');
    await applyMigrations(database, mobileMigrations.slice(0, 5));

    expect((await database.getFirstAsync('PRAGMA user_version'))?.user_version).toBe(5);

    const accountId = 'account-upgrade';
    const seriesId = 'series-upgrade';
    const occurrenceId = 'occurrence-upgrade';
    const updatedAt = '2026-09-09T00:00:00.000Z';
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      updatedAt,
    );
    await database.runAsync(
      `INSERT INTO cached_mission_series
        (account_id, series_id, title, timezone, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      accountId,
      seriesId,
      'Legacy mission',
      'Asia/Hong_Kong',
      '{}',
      updatedAt,
    );
    await database.runAsync(
      `INSERT INTO cached_mission_occurrences
        (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end, all_day, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      accountId,
      occurrenceId,
      seriesId,
      '2026-09-09',
      '09:00',
      '09:30',
      0,
      '{}',
      updatedAt,
    );
    await database.runAsync(
      `INSERT INTO personal_notes (account_id, occurrence_id, note, updated_at)
       VALUES (?, ?, ?, ?)`,
      accountId,
      occurrenceId,
      'Private local note',
      updatedAt,
    );
    await database.runAsync(
      `INSERT INTO search_documents
        (account_id, document_id, occurrence_id, title, personal_note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      accountId,
      occurrenceId,
      occurrenceId,
      'Legacy mission',
      'Legacy general mission note',
      updatedAt,
    );

    await applyMigrations(database, mobileMigrations);

    expect((await database.getFirstAsync('PRAGMA user_version'))?.user_version).toBe(6);
    expect(
      await database.getFirstAsync(
        `SELECT personal_note, general_note
           FROM search_documents
          WHERE account_id = ? AND document_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toEqual({ personal_note: null, general_note: 'Legacy general mission note' });
    expect(
      await database.getFirstAsync(
        `SELECT note
           FROM personal_notes
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toEqual({ note: 'Private local note' });
  });
});
