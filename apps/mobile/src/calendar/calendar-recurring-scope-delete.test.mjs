import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { deleteCalendarMission } from './calendar-mission-delete.js';
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
const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const seriesId = '33333333-3333-4333-8333-333333333333';
const completedPastId = '41111111-1111-4111-8111-111111111111';
const selectedId = '51111111-1111-4111-8111-111111111111';
const completedFutureId = '61111111-1111-4111-8111-111111111111';
const unfinishedFutureId = '71111111-1111-4111-8111-111111111111';

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

function recurrence() {
  return {
    pattern: { type: 'daily', interval: 1 },
    end: { type: 'never' },
  };
}

function occurrence(
  id,
  localDate,
  completionState = 'incomplete',
  evidenceState = 'not_submitted',
) {
  return {
    id,
    seriesId,
    schedule: {
      localStart: `${localDate}T09:00:00`,
      localFinish: `${localDate}T09:30:00`,
      startInstant: `${localDate}T00:00:00.000Z`,
      finishInstant: `${localDate}T00:30:00.000Z`,
      timeZone: 'Asia/Tokyo',
      timeBehavior: 'local_time',
      allDay: false,
      estimatedEffortMinutes: null,
    },
    scheduleState: 'scheduled',
    completionState,
    evidenceState,
    rewardEligibility: completionState === 'completed' ? 'ineligible' : 'eligible',
    rewardIssuance: completionState === 'completed' ? 'issued' : 'not_issued',
    calendarSource: 'internal',
    fieldOwnership: 'app_owned',
    synchronizationState: 'synced',
    storyState: completionState === 'completed' ? 'ready' : 'none',
    deletionState: 'active',
  };
}

async function setupSeries(database) {
  await applyMobileMigrations(database);
  await database.runAsync(
    `INSERT INTO local_accounts
      (account_id, created_at, language, trust_mode, app_time_zone)
     VALUES (?, ?, 'en', 0, 'Asia/Tokyo')`,
    accountId,
    '2026-09-08T00:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_series
      (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, ?, 'Asia/Tokyo', ?, ?)`,
    accountId,
    seriesId,
    'Daily review',
    JSON.stringify({ id: seriesId, title: 'Daily review', recurrence: recurrence() }),
    '2026-09-08T00:00:00.000Z',
  );

  const fixtures = [
    [completedPastId, '2026-09-08', 'completed', 'accepted', 2],
    [selectedId, '2026-09-09', 'incomplete', 'not_submitted', 3],
    [completedFutureId, '2026-09-10', 'completed', 'rejected', 4],
    [unfinishedFutureId, '2026-09-11', 'incomplete', 'not_submitted', 5],
  ];
  for (const [id, localDate, completionState, evidenceState, version] of fixtures) {
    const payload = occurrence(id, localDate, completionState, evidenceState);
    await database.runAsync(
      `INSERT INTO cached_mission_occurrences
        (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
         all_day, payload_json, server_version, updated_at)
       VALUES (?, ?, ?, ?, '09:00', '09:30', 0, ?, ?, ?)`,
      accountId,
      id,
      seriesId,
      localDate,
      JSON.stringify(payload),
      version,
      '2026-09-08T00:00:00.000Z',
    );
  }

  await database.runAsync(
    `INSERT INTO completion_summaries
      (account_id, occurrence_id, completed_at, awarded_xp, payload_json, updated_at)
     VALUES (?, ?, ?, 20, ?, ?)`,
    accountId,
    completedFutureId,
    '2026-09-10T00:25:00.000Z',
    JSON.stringify({ evidenceState: 'rejected', source: 'history' }),
    '2026-09-10T00:25:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO story_drafts
      (account_id, occurrence_id, draft_id, composition_json, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    accountId,
    completedFutureId,
    'story-completed-future',
    JSON.stringify({ text: 'keep this occurrence history' }),
    '2026-09-10T00:25:00.000Z',
  );
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('MTS-052 recurring scoped deletion', () => {
  it('deletes only applicable unfinished occurrences for Entire series and preserves completed occurrence history', async () => {
    const database = createDatabase();
    await setupSeries(database);
    let idCounter = 8;

    await deleteCalendarMission({
      database,
      accountId,
      deviceId,
      occurrenceId: selectedId,
      scope: 'entire_series',
      now: new Date('2026-09-09T00:10:00.000Z'),
      generateId: () => `${String(idCounter++).repeat(8).slice(0, 8)}-8888-4888-8888-888888888888`,
    });

    const tombstones = await database.getAllAsync(
      `SELECT occurrence_id
         FROM mission_occurrence_tombstones
        WHERE account_id = ?
        ORDER BY occurrence_id`,
      accountId,
    );
    expect(tombstones.map((row) => row.occurrence_id)).toEqual([selectedId, unfinishedFutureId]);

    const queued = await database.getAllAsync(
      `SELECT command_json
         FROM mutation_queue
        WHERE account_id = ?
        ORDER BY sequence`,
      accountId,
    );
    const deletes = queued
      .map((row) => JSON.parse(row.command_json).mutation)
      .filter((mutation) => mutation.operation === 'delete');
    expect(deletes.map((mutation) => mutation.entityId)).toEqual([selectedId, unfinishedFutureId]);
    expect(deletes.every((mutation) => mutation.payload === null)).toBe(true);

    const completedFuture = await database.getFirstAsync(
      `SELECT payload_json
         FROM cached_mission_occurrences
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      completedFutureId,
    );
    expect(JSON.parse(completedFuture.payload_json)).toMatchObject({
      id: completedFutureId,
      completionState: 'completed',
      evidenceState: 'rejected',
      storyState: 'ready',
      deletionState: 'active',
    });
    expect(
      await database.getFirstAsync(
        `SELECT awarded_xp, payload_json
           FROM completion_summaries
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        completedFutureId,
      ),
    ).toEqual({
      awarded_xp: 20,
      payload_json: JSON.stringify({ evidenceState: 'rejected', source: 'history' }),
    });
    expect(
      await database.getFirstAsync(
        `SELECT draft_id, composition_json
           FROM story_drafts
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        completedFutureId,
      ),
    ).toEqual({
      draft_id: 'story-completed-future',
      composition_json: JSON.stringify({ text: 'keep this occurrence history' }),
    });
  });
});
