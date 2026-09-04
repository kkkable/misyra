import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { createLocalRepositories } from './local-repositories.js';
import { applyMobileMigrations } from './schema.js';

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

const accountId = 'account-a';
const seriesId = '11111111-1111-4111-8111-111111111111';
const occurrenceId = '22222222-2222-4222-8222-222222222222';

function deletedOccurrencePayload() {
  return {
    id: occurrenceId,
    seriesId,
    schedule: {
      localStart: '2026-09-04T09:00:00',
      localFinish: '2026-09-04T09:30:00',
      startInstant: '2026-09-04T01:00:00.000Z',
      finishInstant: '2026-09-04T01:30:00.000Z',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'local_time',
      allDay: false,
      estimatedEffortMinutes: null,
    },
    scheduleState: 'scheduled',
    completionState: 'completed',
    evidenceState: 'accepted',
    rewardEligibility: 'eligible',
    rewardIssuance: 'issued',
    calendarSource: 'internal',
    fieldOwnership: 'app_owned',
    synchronizationState: 'synced',
    storyState: 'draft',
    deletionState: 'deleted',
  };
}

describe('MTS-029 deleted Story draft visibility', () => {
  it('does not expose a Story draft whose occurrence is tombstoned', async () => {
    const database = new NodeSqliteAdapter();
    try {
      await applyMobileMigrations(database);
      await database.runAsync(
        'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
        accountId,
        '2026-09-04T00:00:00.000Z',
      );
      await database.runAsync(
        `INSERT INTO cached_mission_series
          (account_id, series_id, title, timezone, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        accountId,
        seriesId,
        'Deleted mission',
        'Asia/Hong_Kong',
        JSON.stringify({ id: seriesId, title: 'Deleted mission', recurrence: null }),
        '2026-09-04T00:00:00.000Z',
      );
      await database.runAsync(
        `INSERT INTO cached_mission_occurrences
          (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end, all_day, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        accountId,
        occurrenceId,
        seriesId,
        '2026-09-04',
        '2026-09-04T01:00:00.000Z',
        '2026-09-04T01:30:00.000Z',
        0,
        JSON.stringify(deletedOccurrencePayload()),
        '2026-09-04T02:00:00.000Z',
      );
      await database.runAsync(
        `INSERT INTO story_drafts
          (account_id, occurrence_id, draft_id, composition_json, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        accountId,
        occurrenceId,
        'story-deleted',
        JSON.stringify({ headline: 'Should not render' }),
        '2026-09-04T02:00:00.000Z',
      );

      expect(
        await createLocalRepositories(database, accountId).drafts.getStory(occurrenceId),
      ).toBeNull();
    } finally {
      database.close();
    }
  });
});
