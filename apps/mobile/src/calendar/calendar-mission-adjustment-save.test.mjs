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

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const seriesId = '33333333-3333-4333-8333-333333333333';
const occurrenceId = '44444444-4444-4444-8444-444444444444';

function occurrence(schedule, rewardEligibility = 'eligible') {
  return {
    id: occurrenceId,
    seriesId,
    schedule,
    scheduleState: 'scheduled',
    completionState: 'incomplete',
    evidenceState: 'not_submitted',
    rewardEligibility,
    rewardIssuance: 'not_issued',
    calendarSource: 'internal',
    fieldOwnership: 'app_owned',
    synchronizationState: 'synced',
    storyState: 'none',
    deletionState: 'active',
  };
}

const initialSchedule = {
  localStart: '2026-09-08T09:00:00',
  localFinish: '2026-09-08T10:00:00',
  startInstant: '2026-09-08T00:00:00.000Z',
  finishInstant: '2026-09-08T01:00:00.000Z',
  timeZone: 'Asia/Tokyo',
  timeBehavior: 'local_time',
  allDay: false,
  estimatedEffortMinutes: null,
};

async function setupCachedMission(database) {
  await applyMobileMigrations(database);
  await database.runAsync(
    `INSERT INTO local_accounts
      (account_id, created_at, language, trust_mode, app_time_zone)
     VALUES (?, ?, 'en', 0, 'Asia/Tokyo')`,
    accountId,
    '2026-09-07T12:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_series
      (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    accountId,
    seriesId,
    'Move me',
    'Asia/Tokyo',
    JSON.stringify({ id: seriesId, title: 'Move me', recurrence: null }),
    '2026-09-07T12:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_occurrences
      (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
       all_day, payload_json, server_version, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    accountId,
    occurrenceId,
    seriesId,
    '2026-09-08',
    '09:00',
    '10:00',
    JSON.stringify(occurrence(initialSchedule)),
    3,
    '2026-09-07T12:00:00.000Z',
  );
}

describe('MTS-047 local-first mission adjustment save', () => {
  it('uses exact authoritative server versions for immediate save and synchronized Undo without restoring XP', async () => {
    const database = createDatabase();
    await setupCachedMission(database);
    const ids = ['55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666'];
    const generateId = () => ids.shift();

    await saveCalendarMissionAdjustment({
      database,
      accountId,
      deviceId,
      adjustment: {
        missionId: occurrenceId,
        startMinute: 9 * 60 + 15,
        endMinute: 10 * 60 + 15,
        rewardEligibility: 'ineligible',
        source: 'move',
      },
      now: new Date('2026-09-07T12:01:00.000Z'),
      generateId,
    });

    let cached = await database.getFirstAsync(
      `SELECT scheduled_start, scheduled_end, server_version, payload_json
         FROM cached_mission_occurrences
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      occurrenceId,
    );
    expect(cached).toMatchObject({
      scheduled_start: '09:15',
      scheduled_end: '10:15',
      server_version: 4,
    });
    expect(JSON.parse(cached.payload_json)).toMatchObject({
      rewardEligibility: 'ineligible',
      synchronizationState: 'pending',
      schedule: {
        localStart: '2026-09-08T09:15:00',
        localFinish: '2026-09-08T10:15:00',
        timeZone: 'Asia/Tokyo',
      },
    });

    await saveCalendarMissionAdjustment({
      database,
      accountId,
      deviceId,
      adjustment: {
        missionId: occurrenceId,
        startMinute: 9 * 60,
        endMinute: 10 * 60,
        rewardEligibility: 'ineligible',
        source: 'undo',
      },
      now: new Date('2026-09-07T12:02:00.000Z'),
      generateId,
    });

    cached = await database.getFirstAsync(
      `SELECT scheduled_start, scheduled_end, server_version, payload_json
         FROM cached_mission_occurrences
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      occurrenceId,
    );
    expect(cached).toMatchObject({
      scheduled_start: '09:00',
      scheduled_end: '10:00',
      server_version: 5,
    });
    expect(JSON.parse(cached.payload_json).rewardEligibility).toBe('ineligible');

    const queued = await database.getAllAsync(
      `SELECT command_json
         FROM mutation_queue
        WHERE account_id = ?
        ORDER BY sequence`,
      accountId,
    );
    expect(queued).toHaveLength(2);
    const first = JSON.parse(queued[0].command_json).mutation;
    const second = JSON.parse(queued[1].command_json).mutation;
    expect(first).toMatchObject({
      mutationId: '55555555-5555-4555-8555-555555555555',
      entityId: occurrenceId,
      operation: 'update',
      baseVersion: 3,
      payload: { rewardEligibility: 'ineligible' },
    });
    expect(first.payload.schedule.localStart).toBe('2026-09-08T09:15:00');
    expect(second).toMatchObject({
      mutationId: '66666666-6666-4666-8666-666666666666',
      entityId: occurrenceId,
      operation: 'update',
      baseVersion: 4,
      payload: { rewardEligibility: 'ineligible' },
    });
    expect(second.payload.schedule.localStart).toBe('2026-09-08T09:00:00');
  });
});
