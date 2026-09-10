import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { applyMobileMigrations } from '../storage/schema.js';
import { prepareCalendarMissionDuplicate } from './calendar-mission-duplicate.js';

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

describe('Mission duplicate note ownership', () => {
  it('copies app-owned general notes without substituting Personal Mission Notes', async () => {
    const database = new NodeSqliteAdapter();
    databases.push(database);
    await applyMobileMigrations(database);

    const accountId = '11111111-1111-4111-8111-111111111111';
    const seriesId = '22222222-2222-4222-8222-222222222222';
    const occurrenceId = '33333333-3333-4333-8333-333333333333';
    const updatedAt = '2026-09-09T08:00:00.000Z';
    const schedule = {
      localStart: '2026-09-10T09:00:00',
      localFinish: '2026-09-10T09:30:00',
      startInstant: '2026-09-10T01:00:00.000Z',
      finishInstant: '2026-09-10T01:30:00.000Z',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'local_time',
      allDay: false,
      estimatedEffortMinutes: null,
    };
    const occurrence = {
      id: occurrenceId,
      seriesId,
      schedule,
      scheduleState: 'scheduled',
      completionState: 'incomplete',
      evidenceState: 'not_submitted',
      rewardEligibility: 'eligible',
      rewardIssuance: 'not_issued',
      calendarSource: 'internal',
      fieldOwnership: 'app_owned',
      synchronizationState: 'synced',
      storyState: 'none',
      deletionState: 'active',
    };

    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      updatedAt,
    );
    await database.runAsync(
      `INSERT INTO cached_mission_series
        (account_id, series_id, title, timezone, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      accountId,
      seriesId,
      'Prepare documents',
      schedule.timeZone,
      JSON.stringify({ id: seriesId, title: 'Prepare documents', recurrence: null }),
      updatedAt,
    );
    await database.runAsync(
      `INSERT INTO cached_mission_occurrences
        (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
         all_day, payload_json, server_version, updated_at)
       VALUES (?, ?, ?, '2026-09-10', '09:00', '09:30', 0, ?, 1, ?)`,
      accountId,
      occurrenceId,
      seriesId,
      JSON.stringify(occurrence),
      updatedAt,
    );
    await database.runAsync(
      `INSERT INTO personal_notes (account_id, occurrence_id, note, updated_at)
       VALUES (?, ?, ?, ?)`,
      accountId,
      occurrenceId,
      'Private reminder',
      updatedAt,
    );
    await database.runAsync(
      `INSERT INTO search_documents
        (account_id, document_id, occurrence_id, title, location, provider_text,
         personal_note, general_note, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      accountId,
      occurrenceId,
      occurrenceId,
      'Prepare documents',
      'Central',
      'Private reminder',
      'Bring passport',
      updatedAt,
    );

    const draft = await prepareCalendarMissionDuplicate({
      database,
      accountId,
      occurrenceId,
      now: new Date('2026-09-09T08:00:00.000Z'),
    });

    expect(draft).toMatchObject({
      title: 'Prepare documents',
      location: 'Central',
      notes: 'Bring passport',
    });
  });
});
