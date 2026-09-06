import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { createCalendarMission } from './calendar-mission-create.js';
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

describe('MTS-044 local-first mission save', () => {
  it('atomically writes the optimistic mission cache and queues its server mutation', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await database.runAsync(
      `INSERT INTO local_accounts
        (account_id, created_at, language, trust_mode, app_time_zone)
       VALUES (?, ?, ?, ?, ?)`,
      '11111111-1111-4111-8111-111111111111',
      '2026-09-06T17:00:00.000Z',
      'en',
      0,
      'Asia/Hong_Kong',
    );

    const saved = await createCalendarMission({
      database,
      accountId: '11111111-1111-4111-8111-111111111111',
      deviceId: '22222222-2222-4222-8222-222222222222',
      timeZone: 'Asia/Hong_Kong',
      input: {
        selectedDate: '2026-09-07',
        title: 'Morning mission',
        startMinute: 9 * 60,
        endMinute: 9 * 60 + 30,
        rewardEligibility: 'eligible',
      },
      now: new Date('2026-09-06T17:00:00.000Z'),
      generateId: (() => {
        const ids = [
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
          '55555555-5555-4555-8555-555555555555',
        ];
        return () => ids.shift();
      })(),
    });

    expect(saved.occurrence.rewardEligibility).toBe('eligible');
    expect(saved.occurrence.synchronizationState).toBe('pending');
    expect(saved.occurrence.schedule.timeZone).toBe('Asia/Hong_Kong');
    expect(saved.occurrence.schedule.startInstant).toBe('2026-09-07T01:00:00.000Z');

    const series = await database.getFirstAsync(
      'SELECT title, payload_json FROM cached_mission_series WHERE account_id = ?',
      '11111111-1111-4111-8111-111111111111',
    );
    const occurrence = await database.getFirstAsync(
      `SELECT local_date, scheduled_start, scheduled_end, payload_json
         FROM cached_mission_occurrences
        WHERE account_id = ?`,
      '11111111-1111-4111-8111-111111111111',
    );
    const queued = await database.getFirstAsync(
      'SELECT command_json FROM mutation_queue WHERE account_id = ?',
      '11111111-1111-4111-8111-111111111111',
    );

    expect(series.title).toBe('Morning mission');
    expect(JSON.parse(series.payload_json).id).toBe(
      '33333333-3333-4333-8333-333333333333',
    );
    expect(occurrence.local_date).toBe('2026-09-07');
    expect(occurrence.scheduled_start).toBe('09:00');
    expect(occurrence.scheduled_end).toBe('09:30');
    expect(JSON.parse(occurrence.payload_json).id).toBe(
      '44444444-4444-4444-8444-444444444444',
    );
    const envelope = JSON.parse(queued.command_json);
    expect(envelope.mutation).toMatchObject({
      mutationId: '55555555-5555-4555-8555-555555555555',
      entityType: 'mission',
      entityId: '44444444-4444-4444-8444-444444444444',
      operation: 'create',
      baseVersion: null,
    });
    expect(envelope.mutation.payload).toEqual({
      series: saved.series,
      occurrence: saved.occurrence,
    });
  });
});
