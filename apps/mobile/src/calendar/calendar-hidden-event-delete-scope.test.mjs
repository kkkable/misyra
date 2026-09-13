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
const occurrenceId = '44444444-4444-4444-8444-444444444444';

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('MTS-073 organizer-controlled recurring dismissal transport', () => {
  it('queues the selected hide scope while leaving the effective boundary authoritative on the server', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await database.runAsync(
      `INSERT INTO local_accounts
        (account_id, created_at, language, trust_mode, app_time_zone)
       VALUES (?, ?, 'en', 0, 'Asia/Hong_Kong')`,
      accountId,
      '2026-09-13T00:00:00.000Z',
    );
    await database.runAsync(
      `INSERT INTO cached_mission_series
        (account_id, series_id, title, timezone, payload_json, updated_at)
       VALUES (?, ?, ?, 'Asia/Hong_Kong', ?, ?)`,
      accountId,
      seriesId,
      'Provider recurrence',
      JSON.stringify({
        id: seriesId,
        title: 'Provider recurrence',
        recurrence: {
          pattern: { type: 'daily', interval: 1 },
          end: { type: 'never' },
        },
      }),
      '2026-09-13T00:00:00.000Z',
    );
    await database.runAsync(
      `INSERT INTO cached_mission_occurrences
        (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
         all_day, payload_json, server_version, updated_at)
       VALUES (?, ?, ?, '2026-09-20', '09:00', '09:30', 0, ?, 3, ?)`,
      accountId,
      occurrenceId,
      seriesId,
      JSON.stringify({
        id: occurrenceId,
        seriesId,
        schedule: {
          localStart: '2026-09-20T09:00:00',
          localFinish: '2026-09-20T09:30:00',
          startInstant: '2026-09-20T01:00:00.000Z',
          finishInstant: '2026-09-20T01:30:00.000Z',
          timeZone: 'Asia/Hong_Kong',
          timeBehavior: 'fixed_instant',
          allDay: false,
          estimatedEffortMinutes: null,
        },
        scheduleState: 'scheduled',
        completionState: 'incomplete',
        evidenceState: 'not_submitted',
        rewardEligibility: 'undetermined',
        rewardIssuance: 'not_issued',
        calendarSource: 'external',
        fieldOwnership: 'organizer_controlled',
        synchronizationState: 'synced',
        storyState: 'none',
        deletionState: 'active',
      }),
      '2026-09-13T00:00:00.000Z',
    );

    await deleteCalendarMission({
      database,
      accountId,
      deviceId,
      occurrenceId,
      scope: 'this_and_future',
      now: new Date('2026-09-13T00:10:00.000Z'),
      generateId: () => '55555555-5555-4555-8555-555555555555',
    });

    const queued = await database.getFirstAsync(
      `SELECT command_json
         FROM mutation_queue
        WHERE account_id = ? AND entity_id = ?`,
      accountId,
      occurrenceId,
    );
    const mutation = JSON.parse(queued.command_json).mutation;
    expect(mutation).toMatchObject({
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'delete',
      payload: { recurrenceScope: 'this_and_future' },
    });
    expect(Object.keys(mutation.payload)).toEqual(['recurrenceScope']);
  });
});
