import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { createCalendarMission } from './calendar-mission-create.js';
import { saveCalendarMissionDetails } from './calendar-mission-details-save.js';
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
  close() {
    this.database.close();
  }
}
const databases = [];
function createDatabase() {
  const db = new NodeSqliteAdapter();
  databases.push(db);
  return db;
}
async function seedAccount(database) {
  await applyMobileMigrations(database);
  await database.runAsync(
    `INSERT INTO local_accounts
      (account_id, created_at, language, trust_mode, app_time_zone)
     VALUES (?, ?, ?, ?, ?)`,
    '11111111-1111-4111-8111-111111111111',
    '2026-09-01T00:00:00.000Z',
    'en',
    0,
    'UTC',
  );
}
function uuidFactory() {
  let counter = 1;
  return () => `bbbbbbbb-bbbb-4bbb-8bbb-${String(counter++).padStart(12, '0')}`;
}
afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('MTS-046 Mission Details persistence', () => {
  it('optimistically updates structured app-owned fields, queues a server mutation, separates general notes, and applies the after-start XP rule', async () => {
    const database = createDatabase();
    await seedAccount(database);
    const ids = uuidFactory();
    const mission = await createCalendarMission({
      database,
      accountId: '11111111-1111-4111-8111-111111111111',
      deviceId: '22222222-2222-4222-8222-222222222222',
      input: {
        selectedDate: '2026-09-07',
        title: 'Before',
        startMinute: 9 * 60,
        endMinute: 9 * 60 + 30,
        rewardEligibility: 'eligible',
        timeZone: 'UTC',
        location: 'Old place',
        notes: 'General old note',
      },
      now: new Date('2026-09-07T08:00:00.000Z'),
      generateId: ids,
    });

    await saveCalendarMissionDetails({
      database,
      accountId: '11111111-1111-4111-8111-111111111111',
      deviceId: '22222222-2222-4222-8222-222222222222',
      edit: {
        missionId: mission.occurrence.id,
        title: 'After',
        selectedDate: '2026-09-07',
        startMinute: 11 * 60,
        endMinute: 11 * 60 + 45,
        timeZone: 'UTC',
        location: 'New place',
        notes: 'General new note',
      },
      now: new Date('2026-09-07T10:00:00.000Z'),
      generateId: ids,
    });

    const series = await database.getFirstAsync(
      'SELECT title, payload_json FROM cached_mission_series WHERE account_id = ?',
      '11111111-1111-4111-8111-111111111111',
    );
    const occurrence = await database.getFirstAsync(
      `SELECT scheduled_start, scheduled_end, payload_json, server_version
         FROM cached_mission_occurrences WHERE account_id = ? AND occurrence_id = ?`,
      '11111111-1111-4111-8111-111111111111',
      mission.occurrence.id,
    );
    const search = await database.getFirstAsync(
      `SELECT location, general_note, personal_note FROM search_documents
        WHERE account_id = ? AND occurrence_id = ?`,
      '11111111-1111-4111-8111-111111111111',
      mission.occurrence.id,
    );
    const queued = await database.getAllAsync(
      `SELECT command_json FROM mutation_queue WHERE account_id = ? ORDER BY sequence`,
      '11111111-1111-4111-8111-111111111111',
    );

    expect(series.title).toBe('After');
    expect(JSON.parse(series.payload_json).title).toBe('After');
    expect(occurrence.scheduled_start).toBe('11:00');
    expect(occurrence.scheduled_end).toBe('11:45');
    expect(JSON.parse(occurrence.payload_json).rewardEligibility).toBe('ineligible');
    expect(occurrence.server_version).toBe(2);
    expect(search).toMatchObject({
      location: 'New place',
      general_note: 'General new note',
      personal_note: null,
    });
    expect(queued).toHaveLength(2);
    expect(JSON.parse(queued[1].command_json).mutation).toMatchObject({
      entityType: 'mission',
      entityId: mission.occurrence.id,
      operation: 'update',
      baseVersion: 1,
    });
  });

  it('rejects editing an unfinished mission at its exact completion-window expiry even when moved into the future', async () => {
    const database = createDatabase();
    await seedAccount(database);
    const ids = uuidFactory();
    const mission = await createCalendarMission({
      database,
      accountId: '11111111-1111-4111-8111-111111111111',
      deviceId: '22222222-2222-4222-8222-222222222222',
      input: {
        selectedDate: '2026-08-01',
        title: 'Expired mission',
        startMinute: 9 * 60,
        endMinute: 9 * 60 + 30,
        rewardEligibility: 'eligible',
        timeZone: 'UTC',
      },
      now: new Date('2026-08-01T08:00:00.000Z'),
      generateId: ids,
    });

    await expect(
      saveCalendarMissionDetails({
        database,
        accountId: '11111111-1111-4111-8111-111111111111',
        deviceId: '22222222-2222-4222-8222-222222222222',
        edit: {
          missionId: mission.occurrence.id,
          title: 'Should remain expired',
          selectedDate: '2026-09-01',
          startMinute: 11 * 60,
          endMinute: 11 * 60 + 30,
          timeZone: 'UTC',
          location: null,
          notes: null,
        },
        now: new Date('2026-08-31T09:30:00.000Z'),
        generateId: ids,
      }),
    ).rejects.toThrow('Mission completion window has expired.');

    const cached = await database.getFirstAsync(
      `SELECT local_date, scheduled_start, scheduled_end
         FROM cached_mission_occurrences
        WHERE account_id = ? AND occurrence_id = ?`,
      '11111111-1111-4111-8111-111111111111',
      mission.occurrence.id,
    );
    expect(cached).toMatchObject({
      local_date: '2026-08-01',
      scheduled_start: '09:00',
      scheduled_end: '09:30',
    });
  });
});