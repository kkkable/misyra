import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { createLocalRepositories } from '../storage/local-repositories.js';
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

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

const accountId = 'account-progress';
const visibleSeriesId = '11111111-1111-4111-8111-111111111111';
const deletedSeriesId = '22222222-2222-4222-8222-222222222222';
const visibleOccurrenceId = '33333333-3333-4333-8333-333333333333';
const deletedOccurrenceId = '44444444-4444-4444-8444-444444444444';

function occurrencePayload(id, seriesId, deletionState) {
  return {
    id,
    seriesId,
    schedule: {
      localStart: '2026-09-11T09:00:00',
      localFinish: '2026-09-11T09:30:00',
      startInstant: '2026-09-11T01:00:00.000Z',
      finishInstant: '2026-09-11T01:30:00.000Z',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'local_time',
      allDay: false,
      estimatedEffortMinutes: null,
    },
    scheduleState: 'scheduled',
    completionState: 'completed',
    evidenceState: 'not_required',
    rewardEligibility: 'eligible',
    rewardIssuance: 'issued',
    calendarSource: 'internal',
    fieldOwnership: 'app_owned',
    synchronizationState: 'synced',
    storyState: 'none',
    deletionState,
  };
}

async function seedSeries(database, seriesId, title) {
  await database.runAsync(
    `INSERT INTO cached_mission_series
      (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, ?, 'Asia/Hong_Kong', ?, ?)`,
    accountId,
    seriesId,
    title,
    JSON.stringify({ id: seriesId, title, recurrence: null }),
    '2026-09-11T00:00:00.000Z',
  );
}

async function seedOccurrence(database, occurrenceId, seriesId, deletionState) {
  await database.runAsync(
    `INSERT INTO cached_mission_occurrences
      (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
       all_day, payload_json, server_version, updated_at)
     VALUES (?, ?, ?, '2026-09-11', '09:00', '09:30', 0, ?, 5, ?)`,
    accountId,
    occurrenceId,
    seriesId,
    JSON.stringify(occurrencePayload(occurrenceId, seriesId, deletionState)),
    '2026-09-11T01:05:00.000Z',
  );
}

async function setup(database) {
  await applyMobileMigrations(database);
  await database.runAsync(
    `INSERT INTO local_accounts (account_id, created_at, language, trust_mode, app_time_zone)
     VALUES (?, ?, 'en', 0, 'Asia/Hong_Kong')`,
    accountId,
    '2026-09-11T00:00:00.000Z',
  );
  await seedSeries(database, visibleSeriesId, 'Visible completion');
  await seedSeries(database, deletedSeriesId, 'Deleted completion');
  await seedOccurrence(database, visibleOccurrenceId, visibleSeriesId, 'active');
  await seedOccurrence(database, deletedOccurrenceId, deletedSeriesId, 'deleted');

  await database.runAsync(
    `INSERT INTO completion_summaries
      (account_id, occurrence_id, completed_at, awarded_xp, payload_json, updated_at)
     VALUES (?, ?, ?, 250, '{}', ?)`,
    accountId,
    visibleOccurrenceId,
    '2026-09-11T01:05:00.000Z',
    '2026-09-11T01:05:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO completion_summaries
      (account_id, occurrence_id, completed_at, awarded_xp, payload_json, updated_at)
     VALUES (?, ?, ?, 125, '{}', ?)`,
    accountId,
    deletedOccurrenceId,
    '2026-09-10T01:05:00.000Z',
    '2026-09-10T01:05:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO progress_snapshots
      (account_id, total_xp, total_completed, current_streak, longest_streak, updated_at)
     VALUES (?, 375, 2, 7, 10, ?)`,
    accountId,
    '2026-09-11T01:05:00.000Z',
  );
}

describe('MTS-060 Progress local read model', () => {
  it('keeps deleted completions in aggregates while excluding them from recent history', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);
    await setup(database);
    const repositories = createLocalRepositories(database, accountId);

    await expect(repositories.progress.getSnapshot()).resolves.toEqual({
      totalXp: 375,
      totalCompleted: 2,
      currentStreak: 7,
      longestStreak: 10,
      updatedAt: '2026-09-11T01:05:00.000Z',
    });
    await expect(repositories.progress.listRecent(10)).resolves.toEqual([
      expect.objectContaining({
        occurrenceId: visibleOccurrenceId,
        title: 'Visible completion',
        awardedXp: 250,
      }),
    ]);
  });

  it('silently refreshes an observed aggregate after synchronized local state changes', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);
    await setup(database);
    const repositories = createLocalRepositories(database, accountId);
    const query = repositories.progress.observeSnapshot();
    const snapshots = [];
    const unsubscribe = query.subscribe(() => snapshots.push(query.getSnapshot()));

    await query.refresh();
    await database.runAsync(
      `UPDATE progress_snapshots
          SET total_xp = 500,
              total_completed = 3,
              current_streak = 8,
              longest_streak = 10,
              updated_at = ?
        WHERE account_id = ?`,
      '2026-09-11T02:00:00.000Z',
      accountId,
    );
    await repositories.invalidate(['progress_snapshots']);

    expect(query.getSnapshot()).toEqual({
      totalXp: 500,
      totalCompleted: 3,
      currentStreak: 8,
      longestStreak: 10,
      updatedAt: '2026-09-11T02:00:00.000Z',
    });
    expect(snapshots).toHaveLength(2);
    unsubscribe();
  });
});
