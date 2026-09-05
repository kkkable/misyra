import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { createOfflineCalendarSearch, createSearchSession } from './offline-search.js';
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

async function seed(database) {
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    'account-a',
    '2026-09-05T00:00:00.000Z',
  );
  const rows = [
    ['title', 'occ-title', 'Morning Run', 'Kowloon', 'training plan', 'remember shoes'],
    ['location', 'occ-location', 'Lunch', 'Central Pier', 'team meal', 'window seat'],
    ['provider', 'occ-provider', 'Meeting', 'Office', 'Quarterly budget review', 'bring notebook'],
    ['private', 'occ-private', 'Appointment', 'Clinic', 'routine visit', 'allergy follow-up phrase'],
  ];
  for (const [documentId, occurrenceId, title, location, providerText, personalNote] of rows) {
    await database.runAsync(
      `INSERT INTO search_documents
        (account_id, document_id, occurrence_id, title, location, provider_text, personal_note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'account-a',
      documentId,
      occurrenceId,
      title,
      location,
      providerText,
      personalNote,
      '2026-09-05T00:00:00.000Z',
    );
  }
}

describe('MTS-033 offline Calendar search', () => {
  it('matches title, location, provider text, and personal mission notes through the SQLite index', async () => {
    const database = new NodeSqliteAdapter();
    await applyMobileMigrations(database);
    await seed(database);
    const search = createOfflineCalendarSearch(database, 'account-a');

    await expect(search.query('Morning')).resolves.toEqual([
      expect.objectContaining({ documentId: 'title', occurrenceId: 'occ-title' }),
    ]);
    await expect(search.query('Central')).resolves.toEqual([
      expect.objectContaining({ documentId: 'location', occurrenceId: 'occ-location' }),
    ]);
    await expect(search.query('budget')).resolves.toEqual([
      expect.objectContaining({ documentId: 'provider', occurrenceId: 'occ-provider' }),
    ]);
    await expect(search.query('allergy')).resolves.toEqual([
      expect.objectContaining({ documentId: 'private', occurrenceId: 'occ-private' }),
    ]);
  });

  it('returns a personal-note excerpt only when the personal note caused the match', async () => {
    const database = new NodeSqliteAdapter();
    await applyMobileMigrations(database);
    await seed(database);
    const search = createOfflineCalendarSearch(database, 'account-a');

    const titleMatch = await search.query('Appointment');
    expect(titleMatch[0]?.personalNoteExcerpt).toBeNull();

    const privateMatch = await search.query('allergy');
    expect(privateMatch[0]?.personalNoteExcerpt).toContain('allergy');
    expect(privateMatch[0]?.personalNoteExcerpt.length).toBeLessThanOrEqual(96);
  });

  it('clears in-memory query/results when search closes and never persists recent-query history', async () => {
    const database = new NodeSqliteAdapter();
    await applyMobileMigrations(database);
    await seed(database);
    const search = createOfflineCalendarSearch(database, 'account-a');
    const session = createSearchSession(search);

    await session.search('Morning');
    expect(session.getState()).toMatchObject({ query: 'Morning', results: [{ documentId: 'title' }] });

    session.close();
    expect(session.getState()).toEqual({ query: '', results: [] });

    const historyTables = await database.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND lower(name) LIKE '%search%history%'",
    );
    expect(historyTables).toEqual([]);
  });
});
