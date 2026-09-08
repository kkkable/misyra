import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLocalRepositories } from '../storage/local-repositories.js';
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

function syncApi(change, nextCursor) {
  return {
    push: vi.fn(() => Promise.resolve({ acceptedMutationIds: [], conflicts: [] })),
    pull: vi.fn(() =>
      Promise.resolve({
        kind: 'incremental',
        changes: [change],
        nextCursor,
        hasMore: false,
      }),
    ),
    snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor })),
  };
}

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const seriesId = '33333333-3333-4333-8333-333333333333';
const occurrenceId = '44444444-4444-4444-8444-444444444444';
const mutationId = '55555555-5555-4555-8555-555555555555';

function missionPayload() {
  return {
    version: 1,
    series: { id: seriesId, title: 'Remote mission', recurrence: null },
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

async function setupAccount(database) {
  await applyMobileMigrations(database);
  await database.runAsync(
    'INSERT INTO local_accounts (account_id, created_at) VALUES (?, ?)',
    accountId,
    '2026-09-08T08:00:00.000Z',
  );
}

describe('MTS-048 authoritative mobile mission tombstones', () => {
  it('applies a delete change and refuses a later stale upsert from resurrecting the identifier', async () => {
    const database = createDatabase();
    await setupAccount(database);

    await runAuthenticatedServerSync({
      database,
      accountId,
      api: syncApi(
        {
          sequence: 1,
          entityType: 'mission',
          entityId: occurrenceId,
          operation: 'upsert',
          payload: missionPayload(),
        },
        1,
      ),
    });

    await runAuthenticatedServerSync({
      database,
      accountId,
      api: syncApi(
        {
          sequence: 2,
          entityType: 'mission',
          entityId: occurrenceId,
          operation: 'delete',
          payload: null,
        },
        2,
      ),
    });

    const repositories = createLocalRepositories(database, accountId);
    await expect(repositories.missions.getById(occurrenceId)).resolves.toBeNull();
    expect(
      await database.getFirstAsync(
        `SELECT occurrence_id
           FROM mission_occurrence_tombstones
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toEqual({ occurrence_id: occurrenceId });
    expect(
      await database.getFirstAsync(
        `SELECT title
           FROM cached_mission_series
          WHERE account_id = ? AND series_id = ?`,
        accountId,
        seriesId,
      ),
    ).toBeNull();

    await runAuthenticatedServerSync({
      database,
      accountId,
      api: syncApi(
        {
          sequence: 3,
          entityType: 'mission',
          entityId: occurrenceId,
          operation: 'upsert',
          payload: missionPayload(),
        },
        3,
      ),
    });

    await expect(repositories.missions.getById(occurrenceId)).resolves.toBeNull();
    expect(
      await database.getFirstAsync(
        `SELECT occurrence_id
           FROM mission_occurrence_tombstones
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      ),
    ).toEqual({ occurrence_id: occurrenceId });
  });

  it('settles a delayed edit conflict after pulling the authoritative deletion', async () => {
    const database = createDatabase();
    await setupAccount(database);

    await runAuthenticatedServerSync({
      database,
      accountId,
      api: syncApi(
        {
          sequence: 1,
          entityType: 'mission',
          entityId: occurrenceId,
          operation: 'upsert',
          payload: missionPayload(),
        },
        1,
      ),
    });

    await database.runAsync(
      `INSERT INTO mutation_queue
        (account_id, mutation_id, sequence, command_json, created_at)
       VALUES (?, ?, 1, ?, ?)`,
      accountId,
      mutationId,
      JSON.stringify({
        mutation: {
          mutationId,
          accountId,
          deviceId,
          entityType: 'mission',
          entityId: occurrenceId,
          operation: 'update',
          baseVersion: 1,
          clientOccurredAt: '2026-09-08T08:30:00.000Z',
          payload: { delayed: true },
        },
        destination: { kind: 'server' },
      }),
      '2026-09-08T08:30:00.000Z',
    );

    const api = {
      push: vi.fn(() =>
        Promise.resolve({
          acceptedMutationIds: [],
          conflicts: [{ kind: 'mission_deleted', mutationId, missionId: occurrenceId }],
        }),
      ),
      pull: vi.fn(() =>
        Promise.resolve({
          kind: 'incremental',
          changes: [
            {
              sequence: 2,
              entityType: 'mission',
              entityId: occurrenceId,
              operation: 'delete',
              payload: null,
            },
          ],
          nextCursor: 2,
          hasMore: false,
        }),
      ),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 2 })),
    };

    await expect(runAuthenticatedServerSync({ database, accountId, api })).resolves.toEqual({
      settledMutations: 1,
      cursor: 2,
    });
    expect(
      await database.getFirstAsync(
        'SELECT mutation_id FROM mutation_queue WHERE account_id = ? AND mutation_id = ?',
        accountId,
        mutationId,
      ),
    ).toBeNull();
    await expect(
      createLocalRepositories(database, accountId).missions.getById(occurrenceId),
    ).resolves.toBeNull();
  });
});
