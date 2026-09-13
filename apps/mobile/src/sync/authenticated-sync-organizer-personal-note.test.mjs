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

function syncApi(changes) {
  return {
    push: vi.fn(() => Promise.resolve({ acceptedMutationIds: [], conflicts: [] })),
    pull: vi.fn(() =>
      Promise.resolve({
        kind: 'incremental',
        changes,
        nextCursor: changes.at(-1)?.sequence ?? 0,
        hasMore: false,
      }),
    ),
    snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 0 })),
  };
}

const accountId = '11111111-1111-4111-8111-111111111111';
const seriesId = '33333333-3333-4333-8333-333333333333';
const occurrenceId = '44444444-4444-4444-8444-444444444444';

const organizerMission = {
  series: { id: seriesId, title: 'Organizer meeting', recurrence: null },
  occurrence: {
    id: occurrenceId,
    seriesId,
    schedule: {
      localStart: '2026-09-15T09:00:00',
      localFinish: '2026-09-15T10:00:00',
      startInstant: '2026-09-15T01:00:00.000Z',
      finishInstant: '2026-09-15T02:00:00.000Z',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'fixed_instant',
      allDay: false,
      estimatedEffortMinutes: null,
    },
    scheduleState: 'scheduled',
    completionState: 'incomplete',
    evidenceState: 'not_submitted',
    rewardEligibility: 'eligible',
    rewardIssuance: 'not_issued',
    calendarSource: 'external',
    fieldOwnership: 'organizer_controlled',
    synchronizationState: 'synced',
    storyState: 'none',
    deletionState: 'active',
  },
  location: 'Central',
  notes: 'Organizer agenda',
  version: 2,
};

describe('MTS-072 authenticated organizer ownership projection', () => {
  it('projects provider notes separately and restores the private note on another device', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      '2026-09-13T10:00:00.000Z',
    );
    const api = syncApi([
      {
        sequence: 1,
        entityType: 'mission',
        entityId: occurrenceId,
        operation: 'upsert',
        payload: organizerMission,
      },
      {
        sequence: 2,
        entityType: 'mission_personal_note',
        entityId: occurrenceId,
        operation: 'upsert',
        payload: { note: 'Ask privately about access' },
      },
    ]);

    await expect(runAuthenticatedServerSync({ database, accountId, api })).resolves.toEqual({
      settledMutations: 0,
      cursor: 2,
    });

    expect(
      await database.getFirstAsync(
        `SELECT title, location, provider_text, personal_note, general_note
           FROM search_documents
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toEqual({
      title: 'Organizer meeting',
      location: 'Central',
      provider_text: 'Organizer agenda',
      personal_note: 'Ask privately about access',
      general_note: null,
    });
  });

  it('does not let a later organizer projection overwrite an existing personal note', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await database.runAsync(
      'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
      accountId,
      '2026-09-13T10:00:00.000Z',
    );
    const firstApi = syncApi([
      {
        sequence: 1,
        entityType: 'mission',
        entityId: occurrenceId,
        operation: 'upsert',
        payload: organizerMission,
      },
      {
        sequence: 2,
        entityType: 'mission_personal_note',
        entityId: occurrenceId,
        operation: 'upsert',
        payload: { note: 'Keep this private note' },
      },
    ]);
    await runAuthenticatedServerSync({ database, accountId, api: firstApi });

    const secondApi = syncApi([
      {
        sequence: 3,
        entityType: 'mission',
        entityId: occurrenceId,
        operation: 'upsert',
        payload: {
          ...organizerMission,
          series: { ...organizerMission.series, title: 'Organizer changed title' },
          location: 'Admiralty',
          notes: 'Updated organizer agenda',
          version: 3,
        },
      },
    ]);
    await runAuthenticatedServerSync({ database, accountId, api: secondApi });

    expect(secondApi.pull).toHaveBeenCalledWith({ cursor: 2, limit: 100 });
    expect(
      await database.getFirstAsync(
        `SELECT title, location, provider_text, personal_note, general_note
           FROM search_documents
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toEqual({
      title: 'Organizer changed title',
      location: 'Admiralty',
      provider_text: 'Updated organizer agenda',
      personal_note: 'Keep this private note',
      general_note: null,
    });
  });
});
