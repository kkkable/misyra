import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { queueNoEvidenceCompletion } from './no-evidence-completion-queue.js';
import { applyMobileMigrations } from '../storage/schema.js';

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

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

const accountId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const seriesId = '33333333-3333-4333-8333-333333333333';
const occurrenceId = '44444444-4444-4444-8444-444444444444';
const idempotencyKey = '55555555-5555-4555-8555-555555555555';
const actionAt = '2026-09-11T09:05:00.000Z';

function occurrence() {
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
    JSON.stringify(occurrence()),
    '2026-09-11T08:00:00.000Z',
  );
}

describe('MTS-059 offline Private/Trust completion queue', () => {
  it.each(['private', 'trust'])(
    'persists %s completion and projects grey completed state without network access',
    async (mode) => {
      const database = createDatabase();
      await setup(database);

      await queueNoEvidenceCompletion({
        database,
        accountId,
        deviceId,
        occurrenceId,
        mode,
        effectiveActionAt: actionAt,
        idempotencyKey,
      });

      const cached = await database.getFirstAsync(
        `SELECT payload_json, server_version
           FROM cached_mission_occurrences
          WHERE account_id = ? AND occurrence_id = ?`,
        accountId,
        occurrenceId,
      );
      const projected = JSON.parse(cached.payload_json);
      expect(projected).toMatchObject({
        completionState: 'completed',
        evidenceState: 'not_required',
        rewardIssuance: 'not_issued',
        synchronizationState: 'pending',
      });
      expect(cached.server_version).toBe(4);

      const queued = await database.getFirstAsync(
        `SELECT mutation_id, command_json
           FROM mutation_queue
          WHERE account_id = ?`,
        accountId,
      );
      const envelope = JSON.parse(queued.command_json);
      expect(queued.mutation_id).toBe(idempotencyKey);
      expect(envelope).toEqual({
        mutation: {
          mutationId: idempotencyKey,
          accountId,
          deviceId,
          entityType: 'completion',
          entityId: occurrenceId,
          operation: 'complete',
          baseVersion: null,
          clientOccurredAt: actionAt,
          payload: {
            completionMode: mode,
            effectiveActionAt: actionAt,
            deviceId,
            idempotencyKey,
          },
        },
        destination: { kind: 'server' },
      });
    },
  );
});
