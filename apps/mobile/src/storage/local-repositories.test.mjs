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

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.close();
  }
});

const accountId = 'account-a';
const seriesId = '11111111-1111-4111-8111-111111111111';
const firstOccurrenceId = '22222222-2222-4222-8222-222222222222';
const secondOccurrenceId = '33333333-3333-4333-8333-333333333333';
const outsideOccurrenceId = '44444444-4444-4444-8444-444444444444';
const deletedOccurrenceId = '55555555-5555-4555-8555-555555555555';

function occurrencePayload(id, localDate, deletionState = 'active') {
  return {
    id,
    seriesId,
    schedule: {
      localStart: `${localDate}T09:00:00`,
      localFinish: `${localDate}T09:30:00`,
      startInstant: `${localDate}T01:00:00.000Z`,
      finishInstant: `${localDate}T01:30:00.000Z`,
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

async function seedOccurrence(database, id, localDate, deletionState = 'active') {
  await database.runAsync(
    `INSERT INTO cached_mission_occurrences
      (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end, all_day, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    accountId,
    id,
    seriesId,
    localDate,
    `${localDate}T01:00:00.000Z`,
    `${localDate}T01:30:00.000Z`,
    0,
    JSON.stringify(occurrencePayload(id, localDate, deletionState)),
    '2026-09-04T00:00:00.000Z',
  );
}

async function seedRepositoryData(database) {
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    accountId,
    '2026-09-04T00:00:00.000Z',
  );
  await database.runAsync(
    `UPDATE local_accounts
       SET language = ?, trust_mode = ?, app_time_zone = ?, settings_updated_at = ?
     WHERE account_id = ?`,
    'zh-HK',
    1,
    'Asia/Hong_Kong',
    '2026-09-04T00:00:00.000Z',
    accountId,
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

  await seedOccurrence(database, firstOccurrenceId, '2026-09-04');
  await seedOccurrence(database, secondOccurrenceId, '2026-09-05');
  await seedOccurrence(database, outsideOccurrenceId, '2026-10-01');
  await seedOccurrence(database, deletedOccurrenceId, '2026-09-04', 'deleted');

  await database.runAsync(
    `INSERT INTO completion_summaries
      (account_id, occurrence_id, completed_at, awarded_xp, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    accountId,
    firstOccurrenceId,
    '2026-09-04T01:25:00.000Z',
    25,
    '{}',
    '2026-09-04T01:25:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO planner_drafts (account_id, draft_id, content_json, updated_at)
     VALUES (?, ?, ?, ?)`,
    accountId,
    'planner-a',
    JSON.stringify({ items: [{ title: 'Plan me' }] }),
    '2026-09-04T00:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO story_drafts
      (account_id, occurrence_id, draft_id, composition_json, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    accountId,
    firstOccurrenceId,
    'story-a',
    JSON.stringify({ headline: 'Done' }),
    '2026-09-04T00:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO search_documents
      (account_id, document_id, occurrence_id, title, location, provider_text, personal_note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    accountId,
    'search-a',
    firstOccurrenceId,
    'Morning mission',
    'Central',
    'Provider notes',
    'Private note',
    '2026-09-04T00:00:00.000Z',
  );
}

describe('MTS-029 local repository integration', () => {
  it('returns typed local models for the approved read-model surfaces without exposing deleted missions', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedRepositoryData(database);
    const repositories = createLocalRepositories(database, accountId);

    const calendar = await repositories.calendar.listWindow({
      startLocalDate: '2026-09-04',
      endLocalDate: '2026-09-05',
    });
    expect(calendar.map((item) => item.occurrence.id)).toEqual([
      firstOccurrenceId,
      secondOccurrenceId,
    ]);
    expect(calendar[0]).toMatchObject({
      series: { id: seriesId, title: 'Morning mission', recurrence: null },
      occurrence: {
        id: firstOccurrenceId,
        schedule: { timeZone: 'Asia/Hong_Kong', allDay: false },
        deletionState: 'active',
      },
    });

    expect(await repositories.missions.getById(deletedOccurrenceId)).toBeNull();
    expect(await repositories.missions.getById(firstOccurrenceId)).toMatchObject({
      series: { title: 'Morning mission' },
      occurrence: { id: firstOccurrenceId },
    });
    expect(await repositories.progress.listRecent(10)).toEqual([
      expect.objectContaining({
        occurrenceId: firstOccurrenceId,
        completedAt: '2026-09-04T01:25:00.000Z',
        awardedXp: 25,
      }),
    ]);
    expect(await repositories.settings.get()).toEqual({
      language: 'zh-HK',
      trustMode: true,
      appTimeZone: 'Asia/Hong_Kong',
      updatedAt: '2026-09-04T00:00:00.000Z',
    });
    expect(await repositories.drafts.getPlanner()).toMatchObject({
      draftId: 'planner-a',
      content: { items: [{ title: 'Plan me' }] },
    });
    expect(await repositories.drafts.getStory(firstOccurrenceId)).toMatchObject({
      draftId: 'story-a',
      occurrenceId: firstOccurrenceId,
      composition: { headline: 'Done' },
    });
    expect(await repositories.search.listDocuments(10)).toEqual([
      expect.objectContaining({
        documentId: 'search-a',
        occurrenceId: firstOccurrenceId,
        title: 'Morning mission',
        personalNote: 'Private note',
      }),
    ]);
  });

  it('bounds Calendar reads to the requested local-date window', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedRepositoryData(database);
    const repositories = createLocalRepositories(database, accountId);

    const calendar = await repositories.calendar.listWindow({
      startLocalDate: '2026-09-05',
      endLocalDate: '2026-09-05',
    });

    expect(calendar.map((item) => item.occurrence.id)).toEqual([secondOccurrenceId]);
  });

  it('refreshes an observed Calendar query after the local read model changes', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedRepositoryData(database);
    const repositories = createLocalRepositories(database, accountId);
    const query = repositories.calendar.observeWindow({
      startLocalDate: '2026-09-04',
      endLocalDate: '2026-09-05',
    });
    const snapshots = [];
    const unsubscribe = query.subscribe(() => snapshots.push(query.getSnapshot()));

    await query.refresh();
    const reactiveOccurrenceId = '66666666-6666-4666-8666-666666666666';
    await seedOccurrence(database, reactiveOccurrenceId, '2026-09-05');
    await repositories.invalidate(['cached_mission_occurrences']);

    expect(query.getSnapshot()?.map((item) => item.occurrence.id)).toEqual([
      firstOccurrenceId,
      secondOccurrenceId,
      reactiveOccurrenceId,
    ]);
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    unsubscribe();
  });
});
