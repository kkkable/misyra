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

function occurrencePayload(id) {
  return {
    id,
    seriesId: '11111111-1111-4111-8111-111111111111',
    schedule: {
      localStart: '2026-09-05T09:00:00',
      localFinish: '2026-09-05T09:30:00',
      startInstant: '2026-09-05T01:00:00.000Z',
      finishInstant: '2026-09-05T01:30:00.000Z',
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
    deletionState: 'active',
  };
}

async function seed(database) {
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    'account-a',
    '2026-09-05T00:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_series
      (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    'account-a',
    '11111111-1111-4111-8111-111111111111',
    'Search series',
    'Asia/Hong_Kong',
    JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Search series',
      recurrence: null,
    }),
    '2026-09-05T00:00:00.000Z',
  );

  const rows = [
    [
      'title',
      '22222222-2222-4222-8222-222222222222',
      'Morning Run',
      'Kowloon',
      'training plan',
      'remember shoes',
    ],
    [
      'location',
      '33333333-3333-4333-8333-333333333333',
      'Lunch',
      'Central Pier',
      'team meal',
      'window seat',
    ],
    [
      'provider',
      '44444444-4444-4444-8444-444444444444',
      'Meeting',
      'Office',
      'Quarterly budget review',
      'bring notebook',
    ],
    [
      'private',
      '55555555-5555-4555-8555-555555555555',
      'Appointment',
      'Clinic',
      'routine visit',
      'allergy follow-up phrase',
    ],
    [
      'zh-hk',
      '66666666-6666-4666-8666-666666666666',
      '聽日中環食飯',
      '灣仔',
      '朋友聚餐',
      '記得帶八達通',
    ],
  ];
  for (const [documentId, occurrenceId, title, location, providerText, personalNote] of rows) {
    await database.runAsync(
      `INSERT INTO cached_mission_occurrences
        (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end, all_day, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'account-a',
      occurrenceId,
      '11111111-1111-4111-8111-111111111111',
      '2026-09-05',
      '2026-09-05T01:00:00.000Z',
      '2026-09-05T01:30:00.000Z',
      0,
      JSON.stringify(occurrencePayload(occurrenceId)),
      '2026-09-05T00:00:00.000Z',
    );
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
      expect.objectContaining({ documentId: 'title' }),
    ]);
    await expect(search.query('Central')).resolves.toEqual([
      expect.objectContaining({ documentId: 'location' }),
    ]);
    await expect(search.query('budget')).resolves.toEqual([
      expect.objectContaining({ documentId: 'provider' }),
    ]);
    await expect(search.query('allergy')).resolves.toEqual([
      expect.objectContaining({ documentId: 'private' }),
    ]);
  });

  it('matches normal Traditional-Chinese substrings inside an indexed Han sequence', async () => {
    const database = new NodeSqliteAdapter();
    await applyMobileMigrations(database);
    await seed(database);
    const search = createOfflineCalendarSearch(database, 'account-a');

    await expect(search.query('中環')).resolves.toEqual([
      expect.objectContaining({ documentId: 'zh-hk' }),
    ]);
    await expect(search.query('食飯')).resolves.toEqual([
      expect.objectContaining({ documentId: 'zh-hk' }),
    ]);
  });

  it('preserves prefix matching for non-Han tokens in a mixed Han query', async () => {
    const database = new NodeSqliteAdapter();
    await applyMobileMigrations(database);
    await seed(database);
    await database.runAsync(
      `INSERT INTO search_documents
        (account_id, document_id, occurrence_id, title, location, provider_text, personal_note, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
      'account-a',
      'mixed-visible-substring',
      '中環 brunch',
      null,
      null,
      'private memo',
      '2026-09-05T00:00:01.000Z',
    );
    const search = createOfflineCalendarSearch(database, 'account-a');

    await expect(search.query('中環 run')).resolves.toEqual([]);
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

  it('shows the personal-note excerpt when a multi-token match depends on both visible and private fields', async () => {
    const database = new NodeSqliteAdapter();
    await applyMobileMigrations(database);
    await seed(database);
    const search = createOfflineCalendarSearch(database, 'account-a');

    const mixedMatch = await search.query('Appointment allergy');

    expect(mixedMatch).toEqual([
      expect.objectContaining({
        documentId: 'private',
        personalNoteExcerpt: expect.stringContaining('allergy'),
      }),
    ]);
  });

  it('clears in-memory query/results when search closes and never persists recent-query history', async () => {
    const database = new NodeSqliteAdapter();
    await applyMobileMigrations(database);
    await seed(database);
    const search = createOfflineCalendarSearch(database, 'account-a');
    const session = createSearchSession(search);

    await session.search('Morning');
    expect(session.getState()).toMatchObject({
      query: 'Morning',
      results: [{ documentId: 'title' }],
    });

    session.close();
    expect(session.getState()).toEqual({ query: '', results: [] });

    const historyTables = await database.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND lower(name) LIKE '%search%history%'",
    );
    expect(historyTables).toEqual([]);
  });

  it('keeps search cleared when an in-flight query resolves after close', async () => {
    let resolveQuery;
    const search = {
      query: () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
    };
    const session = createSearchSession(search);

    const pending = session.search('Morning');
    session.close();
    resolveQuery([
      {
        documentId: 'late',
        occurrenceId: null,
        title: 'Late result',
        location: null,
        providerText: null,
        personalNoteExcerpt: null,
      },
    ]);
    await pending;

    expect(session.getState()).toEqual({ query: '', results: [] });
  });
});
