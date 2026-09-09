import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { createCalendarMission } from './calendar-mission-create.js';
import { applyMobileMigrations } from '../storage/schema.js';

class NodeSqliteAdapter {
  constructor() {
    this.database = new DatabaseSync(':memory:');
  }
  async execAsync(sql) { this.database.exec(sql); }
  async runAsync(sql, ...params) { return this.database.prepare(sql).run(...params); }
  async getFirstAsync(sql, ...params) { return this.database.prepare(sql).get(...params) ?? null; }
  async getAllAsync(sql, ...params) { return this.database.prepare(sql).all(...params); }
  async withExclusiveTransactionAsync(task) {
    this.database.exec('BEGIN IMMEDIATE');
    try { await task(this); this.database.exec('COMMIT'); }
    catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
  close() { this.database.close(); }
}

const databases = [];
function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}
async function seedAccount(database) {
  await applyMobileMigrations(database);
  await database.runAsync(
    `INSERT INTO local_accounts
      (account_id, created_at, language, trust_mode, app_time_zone)
     VALUES (?, ?, ?, ?, ?)`,
    '11111111-1111-4111-8111-111111111111',
    '2026-01-01T00:00:00.000Z',
    'en', 0, 'UTC',
  );
}
function uuidFactory() {
  let counter = 1;
  return () => {
    const suffix = String(counter++).padStart(12, '0');
    return `aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`;
  };
}
afterEach(() => { while (databases.length > 0) databases.pop()?.close(); });

describe('MTS-051 recurring occurrence materialization', () => {
  it('materializes the bounded recurrence window with one permanent UUID per valid occurrence and no duplicate anchor', async () => {
    const database = createDatabase();
    await seedAccount(database);

    await createCalendarMission({
      database,
      accountId: '11111111-1111-4111-8111-111111111111',
      deviceId: '22222222-2222-4222-8222-222222222222',
      input: {
        selectedDate: '2026-01-31',
        title: 'Month end mission',
        startMinute: 9 * 60,
        endMinute: 9 * 60 + 30,
        rewardEligibility: 'eligible',
        timeZone: 'UTC',
        recurrence: {
          pattern: { type: 'monthly-date', interval: 1, dayOfMonth: 31 },
          end: { type: 'count', occurrenceCount: 3 },
        },
      },
      now: new Date('2026-01-01T00:00:00.000Z'),
      generateId: uuidFactory(),
    });

    const occurrences = await database.getAllAsync(
      `SELECT occurrence_id, local_date
         FROM cached_mission_occurrences
        WHERE account_id = ?
        ORDER BY local_date`,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(occurrences.map((row) => row.local_date)).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ]);
    expect(new Set(occurrences.map((row) => row.occurrence_id)).size).toBe(3);

    const queue = await database.getAllAsync(
      `SELECT command_json FROM mutation_queue
        WHERE account_id = ? ORDER BY sequence`,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(queue).toHaveLength(3);
    expect(queue.map((row) => JSON.parse(row.command_json).mutation.entityId)).toEqual(
      occurrences.map((row) => row.occurrence_id),
    );
  });
});
