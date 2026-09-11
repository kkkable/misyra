import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { queueNoEvidenceCompletion } from '../calendar/no-evidence-completion-queue.js';
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

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const seriesId = '33333333-3333-4333-8333-333333333333';
const occurrenceId = '44444444-4444-4444-8444-444444444444';
const mutationId = '55555555-5555-4555-8555-555555555555';
const unrelatedMissionId = '66666666-6666-4666-8666-666666666666';
const actionAt = '2026-09-11T09:05:00.000Z';

function createDatabase() {
  const database = new NodeSqliteAdapter();
  databases.push(database);
  return database;
}

function missionOccurrence(overrides = {}) {
  return {
    id: occurrenceId,
    seriesId,
    schedule: {
      localStart: '2026-09-11T09:00:00',
      localFinish: '2026-09-11T10:00:00',
      startInstant: '2026-09-11T09:00:00.000Z',
      finishInstant: '2026-09-11T10:00:00.000Z',
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
    ...overrides,
  };
}

async function setup(database) {
  await applyMobileMigrations(database);
  await database.runAsync(
    `INSERT INTO local_accounts
      (account_id, created_at, language, trust_mode, app_time_zone)
     VALUES (?, ?, 'en', 1, 'UTC')`,
    accountId,
    '2026-09-11T08:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_series
      (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, 'Offline mission', 'UTC', ?, ?)`,
    accountId,
    seriesId,
    JSON.stringify({ id: seriesId, title: 'Offline mission', recurrence: null }),
    '2026-09-11T08:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_occurrences
      (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
       all_day, payload_json, server_version, updated_at)
     VALUES (?, ?, ?, '2026-09-11', '09:00', '10:00', 0, ?, 4, ?)`,
    accountId,
    occurrenceId,
    seriesId,
    JSON.stringify(missionOccurrence()),
    '2026-09-11T08:00:00.000Z',
  );
  await queueNoEvidenceCompletion({
    database,
    accountId,
    deviceId,
    occurrenceId,
    mode: 'private',
    effectiveActionAt: actionAt,
    idempotencyKey: mutationId,
  });
}

function completedMissionChange() {
  return {
    sequence: 1,
    entityType: 'mission',
    entityId: occurrenceId,
    operation: 'upsert',
    payload: {
      version: 5,
      series: { id: seriesId, title: 'Offline mission', recurrence: null },
      occurrence: missionOccurrence({
        completionState: 'completed',
        evidenceState: 'not_required',
        rewardIssuance: 'issued',
        synchronizationState: 'synced',
      }),
      location: null,
      notes: null,
    },
  };
}

describe('MTS-059 authenticated completion conflict settlement', () => {
  it('settles an already-completed offline command after authoritative pull instead of leaving it stuck', async () => {
    const database = createDatabase();
    await setup(database);
    const api = {
      push: vi.fn(() =>
        Promise.resolve({
          acceptedMutationIds: [],
          conflicts: [
            {
              kind: 'mission_completed_elsewhere',
              mutationId,
              missionId: occurrenceId,
            },
          ],
        }),
      ),
      pull: vi.fn(() =>
        Promise.resolve({
          kind: 'incremental',
          changes: [completedMissionChange()],
          nextCursor: 1,
          hasMore: false,
        }),
      ),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 1 })),
    };

    await expect(runAuthenticatedServerSync({ database, accountId, api })).resolves.toEqual({
      settledMutations: 1,
      cursor: 1,
    });

    expect(
      await database.getFirstAsync(
        'SELECT mutation_id FROM mutation_queue WHERE account_id = ?',
        accountId,
      ),
    ).toBeNull();
    const cached = await database.getFirstAsync(
      `SELECT payload_json, server_version
         FROM cached_mission_occurrences
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      occurrenceId,
    );
    expect(JSON.parse(cached.payload_json)).toMatchObject({
      completionState: 'completed',
      evidenceState: 'not_required',
      rewardIssuance: 'issued',
      synchronizationState: 'synced',
    });
    expect(cached.server_version).toBe(5);
  });

  it('settles a rejected offline completion after pull and restores the optimistic local projection', async () => {
    const database = createDatabase();
    await setup(database);
    const api = {
      push: vi.fn(() =>
        Promise.resolve({
          acceptedMutationIds: [],
          conflicts: [
            {
              kind: 'mission_updated',
              mutationId,
              missionId: occurrenceId,
            },
          ],
        }),
      ),
      pull: vi.fn(() =>
        Promise.resolve({ kind: 'incremental', changes: [], nextCursor: 0, hasMore: false }),
      ),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 0 })),
    };

    await expect(runAuthenticatedServerSync({ database, accountId, api })).resolves.toEqual({
      settledMutations: 1,
      cursor: 0,
    });
    expect(
      await database.getFirstAsync(
        'SELECT mutation_id FROM mutation_queue WHERE account_id = ?',
        accountId,
      ),
    ).toBeNull();

    const cached = await database.getFirstAsync(
      `SELECT payload_json, server_version
         FROM cached_mission_occurrences
        WHERE account_id = ? AND occurrence_id = ?`,
      accountId,
      occurrenceId,
    );
    expect(JSON.parse(cached.payload_json)).toMatchObject({
      completionState: 'incomplete',
      evidenceState: 'not_submitted',
      rewardIssuance: 'not_issued',
      synchronizationState: 'synced',
    });
    expect(cached.server_version).toBe(4);
  });

  it('still fails closed for a mission-update conflict that does not match the queued completion', async () => {
    const database = createDatabase();
    await setup(database);
    const api = {
      push: vi.fn(() =>
        Promise.resolve({
          acceptedMutationIds: [],
          conflicts: [
            {
              kind: 'mission_updated',
              mutationId,
              missionId: unrelatedMissionId,
            },
          ],
        }),
      ),
      pull: vi.fn(() =>
        Promise.resolve({ kind: 'incremental', changes: [], nextCursor: 0, hasMore: false }),
      ),
      snapshot: vi.fn(() => Promise.resolve({ entries: [], nextCursor: 0 })),
    };

    await expect(runAuthenticatedServerSync({ database, accountId, api })).rejects.toThrow(
      'Conflict outcomes require an application handler before settlement.',
    );
    expect(
      await database.getFirstAsync(
        'SELECT mutation_id FROM mutation_queue WHERE account_id = ?',
        accountId,
      ),
    ).toEqual({ mutation_id: mutationId });
  });
});
