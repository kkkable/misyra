import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { saveCalendarMissionAdjustment } from './calendar-mission-adjustment-save.js';
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
const sourceSeriesId = '33333333-3333-4333-8333-333333333333';
const completedPastId = '41111111-1111-4111-8111-111111111111';
const selectedId = '51111111-1111-4111-8111-111111111111';
const completedFutureId = '61111111-1111-4111-8111-111111111111';
const unfinishedFutureId = '71111111-1111-4111-8111-111111111111';
const targetSeriesId = '88888888-8888-4888-8888-888888888888';

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

const originalRecurrence = {
  pattern: { type: 'daily', interval: 1 },
  end: { type: 'never' },
};

function occurrence(
  id,
  localDate,
  completionState = 'incomplete',
  evidenceState = 'not_submitted',
) {
  return {
    id,
    seriesId: sourceSeriesId,
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
     VALUES (?, ?, 'Daily review', 'Asia/Tokyo', ?, ?)`,
    accountId,
    sourceSeriesId,
    JSON.stringify({ id: sourceSeriesId, title: 'Daily review', recurrence: originalRecurrence }),
    '2026-09-08T00:00:00.000Z',
  );

  const fixtures = [
    [completedPastId, '2026-09-08', 'completed', 'accepted', 2],
    [selectedId, '2026-09-09', 'incomplete', 'not_submitted', 3],
    [completedFutureId, '2026-09-10', 'completed', 'rejected', 4],
    [unfinishedFutureId, '2026-09-11', 'incomplete', 'not_submitted', 5],
  ];
  for (const [id, localDate, completionState, evidenceState, version] of fixtures) {
    await database.runAsync(
      `INSERT INTO cached_mission_occurrences
        (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
         all_day, payload_json, server_version, updated_at)
       VALUES (?, ?, ?, ?, '09:00', '09:30', 0, ?, ?, ?)`,
      accountId,
      id,
      sourceSeriesId,
      localDate,
      JSON.stringify(occurrence(id, localDate, completionState, evidenceState)),
      version,
      '2026-09-08T00:00:00.000Z',
    );
  }
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('MTS-052 recurring scoped edit persistence', () => {
  it('splits This and future into a new recurring series, preserves completed history, and queues each affected occurrence for sync', async () => {
    const database = createDatabase();
    await setupSeries(database);
    let mutationCounter = 9;

    await saveCalendarMissionAdjustment({
      database,
      accountId,
      deviceId,
      adjustment: {
        missionId: selectedId,
        startMinute: 10 * 60,
        endMinute: 10 * 60 + 30,
        rewardEligibility: 'eligible',
        source: 'move',
      },
      scope: 'this_and_future',
      now: new Date('2026-09-08T12:00:00.000Z'),
      generateId: () =>
        `${String(mutationCounter++).repeat(8).slice(0, 8)}-9999-4999-8999-999999999999`,
      generateSeriesId: () => targetSeriesId,
    });

    const seriesRows = await database.getAllAsync(
      `SELECT series_id, payload_json
         FROM cached_mission_series
        WHERE account_id = ?
        ORDER BY series_id`,
      accountId,
    );
    expect(seriesRows).toHaveLength(2);
    const sourceSeries = seriesRows.find((row) => row.series_id === sourceSeriesId);
    const targetSeries = seriesRows.find((row) => row.series_id === targetSeriesId);
    expect(JSON.parse(sourceSeries.payload_json).recurrence).toEqual({
      pattern: { type: 'daily', interval: 1 },
      end: { type: 'date', inclusiveLocalDate: '2026-09-08' },
    });
    expect(JSON.parse(targetSeries.payload_json)).toEqual({
      id: targetSeriesId,
      title: 'Daily review',
      recurrence: originalRecurrence,
    });

    const rows = await database.getAllAsync(
      `SELECT occurrence_id, series_id, scheduled_start, scheduled_end, payload_json
         FROM cached_mission_occurrences
        WHERE account_id = ?
        ORDER BY local_date, occurrence_id`,
      accountId,
    );
    const byId = new Map(rows.map((row) => [row.occurrence_id, row]));
    expect(byId.get(completedPastId).series_id).toBe(sourceSeriesId);
    expect(byId.get(completedFutureId).series_id).toBe(sourceSeriesId);
    expect(JSON.parse(byId.get(completedFutureId).payload_json)).toMatchObject({
      completionState: 'completed',
      evidenceState: 'rejected',
      storyState: 'ready',
    });

    for (const id of [selectedId, unfinishedFutureId]) {
      expect(byId.get(id).series_id).toBe(targetSeriesId);
      expect(byId.get(id).scheduled_start).toBe('10:00');
      expect(byId.get(id).scheduled_end).toBe('10:30');
      expect(JSON.parse(byId.get(id).payload_json)).toMatchObject({
        seriesId: targetSeriesId,
        completionState: 'incomplete',
        evidenceState: 'not_submitted',
      });
    }

    const queued = await database.getAllAsync(
      `SELECT command_json
         FROM mutation_queue
        WHERE account_id = ?
        ORDER BY sequence`,
      accountId,
    );
    const updates = queued.map((row) => JSON.parse(row.command_json).mutation);
    expect(updates.map((mutation) => mutation.entityId)).toEqual([selectedId, unfinishedFutureId]);
    expect(updates.every((mutation) => mutation.operation === 'update')).toBe(true);
    expect(updates.every((mutation) => mutation.payload.series?.id === targetSeriesId)).toBe(true);
    expect(updates[0].payload.sourceSeries).toEqual({
      id: sourceSeriesId,
      recurrence: {
        pattern: { type: 'daily', interval: 1 },
        end: { type: 'date', inclusiveLocalDate: '2026-09-08' },
      },
    });
  });
});
