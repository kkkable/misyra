import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

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

const databases = [];
const accountId = 'account-a';
const seriesId = '11111111-1111-4111-8111-111111111111';
const visibleOccurrenceId = '22222222-2222-4222-8222-222222222222';

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

function occurrencePayload(id, deletionState = 'active') {
  return {
    id,
    seriesId,
    schedule: {
      localStart: '2026-09-04T09:00:00',
      localFinish: '2026-09-04T09:30:00',
      startInstant: '2026-09-04T01:00:00.000Z',
      finishInstant: '2026-09-04T01:30:00.000Z',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'local_time',
      allDay: false,
      estimatedEffortMinutes: null,
    },
    scheduleState: 'scheduled',
    completionState: 'incomplete',
    evidenceState: 'not_submitted',
    rewardEligibility: 'eligible',
    rewardIssuance: 'not_issued',
    calendarSource: 'internal',
    fieldOwnership: 'app_owned',
    synchronizationState: 'synced',
    storyState: 'none',
    deletionState,
  };
}

async function seedBase(database) {
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    accountId,
    '2026-09-04T00:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_series
      (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    accountId,
    seriesId,
    'Morning mission',
    'Asia/Hong_Kong',
    JSON.stringify({ id: seriesId, title: 'Morning mission', recurrence: null }),
    '2026-09-04T00:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_occurrences
      (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end, all_day, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    accountId,
    visibleOccurrenceId,
    seriesId,
    '2026-09-04',
    '2026-09-04T01:00:00.000Z',
    '2026-09-04T01:30:00.000Z',
    0,
    JSON.stringify(occurrencePayload(visibleOccurrenceId)),
    '2026-09-04T00:00:00.000Z',
  );
}

async function seedDeletedOccurrence(database, index) {
  const suffix = index.toString(16).padStart(12, '0');
  const occurrenceId = `77777777-7777-4777-8777-${suffix}`;
  await database.runAsync(
    `INSERT INTO cached_mission_occurrences
      (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end, all_day, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    accountId,
    occurrenceId,
    seriesId,
    '2026-09-05',
    '2026-09-05T01:00:00.000Z',
    '2026-09-05T01:30:00.000Z',
    0,
    JSON.stringify(occurrencePayload(occurrenceId, 'deleted')),
    '2026-09-05T00:00:00.000Z',
  );
  return occurrenceId;
}

describe('MTS-029 review corrections', () => {
  it('does not let deleted completions consume the bounded visible Progress result', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedBase(database);
    await database.runAsync(
      `INSERT INTO completion_summaries
        (account_id, occurrence_id, completed_at, awarded_xp, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      accountId,
      visibleOccurrenceId,
      '2026-09-04T01:25:00.000Z',
      25,
      '{}',
      '2026-09-04T01:25:00.000Z',
    );

    for (let index = 1; index <= 100; index += 1) {
      const occurrenceId = await seedDeletedOccurrence(database, index);
      const timestamp = `2026-09-05T${String(Math.floor((index - 1) / 60)).padStart(
        2,
        '0',
      )}:${String((index - 1) % 60).padStart(2, '0')}:00.000Z`;
      await database.runAsync(
        `INSERT INTO completion_summaries
          (account_id, occurrence_id, completed_at, awarded_xp, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        accountId,
        occurrenceId,
        timestamp,
        0,
        '{}',
        timestamp,
      );
    }

    expect(await createLocalRepositories(database, accountId).progress.listRecent(1)).toEqual([
      expect.objectContaining({ occurrenceId: visibleOccurrenceId }),
    ]);
  });

  it('does not let deleted search documents consume the bounded visible search result', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedBase(database);
    await database.runAsync(
      `INSERT INTO search_documents
        (account_id, document_id, occurrence_id, title, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      accountId,
      'visible-search',
      visibleOccurrenceId,
      'Visible mission',
      '2026-09-04T00:00:00.000Z',
    );

    for (let index = 1; index <= 100; index += 1) {
      const occurrenceId = await seedDeletedOccurrence(database, index);
      await database.runAsync(
        `INSERT INTO search_documents
          (account_id, document_id, occurrence_id, title, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        accountId,
        `deleted-search-${String(index).padStart(3, '0')}`,
        occurrenceId,
        'Deleted mission',
        `2026-09-05T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
      );
    }

    expect(await createLocalRepositories(database, accountId).search.listDocuments(1)).toEqual([
      expect.objectContaining({ documentId: 'visible-search' }),
    ]);
  });

  it('filters ended hidden events before limiting the Settings result', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedBase(database);
    await database.runAsync(
      `INSERT INTO hidden_event_summaries
        (account_id, hidden_event_id, starts_at, ends_at, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      accountId,
      'past-hidden',
      '2000-01-01T00:00:00.000Z',
      '2000-01-01T01:00:00.000Z',
      '{}',
      '2000-01-01T00:00:00.000Z',
    );
    await database.runAsync(
      `INSERT INTO hidden_event_summaries
        (account_id, hidden_event_id, starts_at, ends_at, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      accountId,
      'future-hidden',
      '2999-01-01T00:00:00.000Z',
      '2999-01-01T01:00:00.000Z',
      '{}',
      '2026-09-04T00:00:00.000Z',
    );

    expect(
      await createLocalRepositories(database, accountId).settings.listHiddenEvents(1),
    ).toEqual([expect.objectContaining({ hiddenEventId: 'future-hidden' })]);
  });
});
