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
const accountId = '11111111-1111-4111-8111-111111111111';
const seriesId = '33333333-3333-4333-8333-333333333333';
const occurrenceId = '44444444-4444-4444-8444-444444444444';

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

function recurringMissionPayload() {
  return {
    version: 1,
    series: {
      id: seriesId,
      title: 'Remote recurring mission',
      recurrence: {
        pattern: { type: 'weekly', interval: 2, weekdays: [1, 3], weekStartsOn: 1 },
        end: { type: 'count', occurrenceCount: 6 },
      },
    },
    occurrence: {
      id: occurrenceId,
      seriesId,
      schedule: {
        localStart: '2026-09-08T09:00:00',
        localFinish: '2026-09-08T09:30:00',
        startInstant: '2026-09-08T09:00:00.000Z',
        finishInstant: '2026-09-08T09:30:00.000Z',
        timeZone: 'UTC',
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
    notes: null,
  };
}

describe('MTS-051 recurring mission sync projection', () => {
  it('preserves authoritative recurrence when caching a pulled mission series', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      '2026-09-08T08:00:00.000Z',
    );

    const api = {
      push: vi.fn(() => Promise.resolve({ acceptedMutationIds: [], conflicts: [] })),
      pull: vi.fn(() =>
        Promise.resolve({
          kind: 'incremental',
          changes: [
            {
              sequence: 1,
              entityType: 'mission',
              entityId: occurrenceId,
              operation: 'upsert',
              payload: recurringMissionPayload(),
            },
          ],
          nextCursor: 1,
          hasMore: false,
        }),
      ),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 1 })),
    };

    await runAuthenticatedServerSync({ database, accountId, api });

    const cached = await database.getFirstAsync(
      `SELECT payload_json
         FROM cached_mission_series
        WHERE account_id = ? AND series_id = ?`,
      accountId,
      seriesId,
    );
    expect(JSON.parse(cached.payload_json).recurrence).toEqual(
      recurringMissionPayload().series.recurrence,
    );
  });
});
