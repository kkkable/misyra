import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyMobileMigrations } from '../storage/schema.js';
import { runAuthenticatedServerSync } from './authenticated-sync-runtime.js';

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

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

function syncApi(change) {
  return {
    push: vi.fn(() => Promise.resolve({ acceptedMutationIds: [], conflicts: [] })),
    pull: vi.fn(() =>
      Promise.resolve({
        kind: 'incremental',
        changes: [change],
        nextCursor: 1,
        hasMore: false,
      }),
    ),
    snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 1 })),
  };
}

describe('authenticated mission synchronization', () => {
  it('projects an authoritative timed mission upsert into Calendar and search read models', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    const accountId = '11111111-1111-4111-8111-111111111111';
    const seriesId = '33333333-3333-4333-8333-333333333333';
    const occurrenceId = '44444444-4444-4444-8444-444444444444';
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      '2026-09-06T17:00:00.000Z',
    );
    const payload = {
      series: { id: seriesId, title: 'Morning mission', recurrence: null },
      occurrence: {
        id: occurrenceId,
        seriesId,
        schedule: {
          localStart: '2026-09-07T09:00:00',
          localFinish: '2026-09-07T09:30:00',
          startInstant: '2026-09-07T01:00:00.000Z',
          finishInstant: '2026-09-07T01:30:00.000Z',
          timeZone: 'Asia/Hong_Kong',
          timeBehavior: 'local_time',
          allDay: false,
          estimatedEffortMinutes: null,
        },
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
      },
      location: null,
      personalNote: null,
    };
    const api = syncApi({
      sequence: 1,
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'upsert',
      payload,
    });

    await expect(runAuthenticatedServerSync({ database, accountId, api })).resolves.toEqual({
      settledMutations: 0,
      cursor: 1,
    });

    const occurrence = await database.getFirstAsync(
      `SELECT local_date, scheduled_start, scheduled_end, payload_json
         FROM cached_mission_occurrences
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      occurrenceId,
    );
    const searchDocument = await database.getFirstAsync(
      `SELECT title, occurrence_id
         FROM search_documents
        WHERE account_id = ? AND document_id = ?`,
      accountId,
      occurrenceId,
    );
    expect(occurrence).toMatchObject({
      local_date: '2026-09-07',
      scheduled_start: '09:00',
      scheduled_end: '09:30',
    });
    expect(JSON.parse(occurrence.payload_json).synchronizationState).toBe('synced');
    expect(searchDocument).toEqual({ title: 'Morning mission', occurrence_id: occurrenceId });
  });

  it('projects MTS-045 all-day, Private, location, and personal-note data on another device', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    const accountId = '11111111-1111-4111-8111-111111111111';
    const seriesId = '55555555-5555-4555-8555-555555555555';
    const occurrenceId = '66666666-6666-4666-8666-666666666666';
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      '2026-09-06T17:00:00.000Z',
    );
    const payload = {
      series: { id: seriesId, title: 'Private all-day mission', recurrence: null },
      occurrence: {
        id: occurrenceId,
        seriesId,
        schedule: {
          localStart: '2026-09-08T00:00:00',
          localFinish: '2026-09-09T00:00:00',
          startInstant: '2026-09-07T16:00:00.000Z',
          finishInstant: '2026-09-08T16:00:00.000Z',
          timeZone: 'Asia/Hong_Kong',
          timeBehavior: 'local_time',
          allDay: true,
          estimatedEffortMinutes: 45,
        },
        scheduleState: 'scheduled',
        completionState: 'incomplete',
        evidenceState: 'not_required',
        rewardEligibility: 'eligible',
        rewardIssuance: 'not_issued',
        calendarSource: 'internal',
        fieldOwnership: 'app_owned',
        synchronizationState: 'synced',
        storyState: 'none',
        deletionState: 'active',
      },
      location: 'Central',
      personalNote: 'Bring documents',
    };
    const api = syncApi({
      sequence: 1,
      entityType: 'mission',
      entityId: occurrenceId,
      operation: 'upsert',
      payload,
    });

    await expect(runAuthenticatedServerSync({ database, accountId, api })).resolves.toEqual({
      settledMutations: 0,
      cursor: 1,
    });

    expect(
      await database.getFirstAsync(
        `SELECT local_date, scheduled_start, scheduled_end, all_day
           FROM cached_mission_occurrences
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toEqual({
      local_date: '2026-09-08',
      scheduled_start: null,
      scheduled_end: null,
      all_day: 1,
    });
    expect(
      await database.getFirstAsync(
        `SELECT title, location, personal_note
           FROM search_documents
          WHERE account_id = ? AND document_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toEqual({
      title: 'Private all-day mission',
      location: 'Central',
      personal_note: 'Bring documents',
    });
  });
});
