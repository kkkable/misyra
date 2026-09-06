import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { applyMobileMigrations } from '../storage/schema.js';
import { createCalendarMission } from './calendar-mission-create.js';

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

function generateIds() {
  const ids = [
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
  ];
  return () => ids.shift();
}

async function seedAccount(database) {
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
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('MTS-045 mission form persistence', () => {
  it('converts an all-day form to local-midnight schedule with required effort', async () => {
    const database = createDatabase();
    await seedAccount(database);

    const saved = await createCalendarMission({
      database,
      accountId: '11111111-1111-4111-8111-111111111111',
      deviceId: '22222222-2222-4222-8222-222222222222',
      input: {
        selectedDate: '2026-09-07',
        title: 'All-day mission',
        allDay: true,
        startMinute: null,
        endMinute: null,
        estimatedEffortMinutes: 45,
        rewardEligibility: 'eligible',
        timeZone: 'Asia/Hong_Kong',
        timeBehavior: 'local_time',
        private: false,
        location: null,
        notes: null,
      },
      now: new Date('2026-09-06T17:00:00.000Z'),
      generateId: generateIds(),
    });

    expect(saved.occurrence.schedule).toMatchObject({
      allDay: true,
      estimatedEffortMinutes: 45,
      localStart: '2026-09-07T00:00:00',
      localFinish: '2026-09-08T00:00:00',
      timeZone: 'Asia/Hong_Kong',
    });

    const row = await database.getFirstAsync(
      `SELECT scheduled_start, scheduled_end, all_day
         FROM cached_mission_occurrences
        WHERE account_id = ?`,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(row).toEqual({ scheduled_start: '00:00', scheduled_end: '00:00', all_day: 1 });
  });

  it('persists private evidence state plus optional location and notes in the local search projection', async () => {
    const database = createDatabase();
    await seedAccount(database);

    const saved = await createCalendarMission({
      database,
      accountId: '11111111-1111-4111-8111-111111111111',
      deviceId: '22222222-2222-4222-8222-222222222222',
      input: {
        selectedDate: '2026-09-07',
        title: 'Private mission',
        allDay: false,
        startMinute: 540,
        endMinute: 570,
        estimatedEffortMinutes: null,
        rewardEligibility: 'eligible',
        timeZone: 'Asia/Hong_Kong',
        timeBehavior: 'fixed_instant',
        private: true,
        location: 'Central',
        notes: 'Bring documents',
      },
      now: new Date('2026-09-06T17:00:00.000Z'),
      generateId: generateIds(),
    });

    expect(saved.occurrence.evidenceState).toBe('not_required');
    expect(saved.occurrence.schedule.timeBehavior).toBe('fixed_instant');
    const search = await database.getFirstAsync(
      `SELECT location, personal_note
         FROM search_documents
        WHERE account_id = ?`,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(search).toEqual({ location: 'Central', personal_note: 'Bring documents' });
  });
});
