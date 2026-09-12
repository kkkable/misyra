import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deleteCalendarMission,
  undoCalendarMissionDeletion,
} from '../calendar/calendar-mission-delete.js';
import { applyMobileMigrations } from '../storage/schema.js';
import { subscribeLocalMutationApplied } from '../storage/mutation-queue.js';
import { createMissionNotificationReconciler } from './notification-reconciler.js';

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

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const DEVICE_ID = '22222222-2222-4222-8222-222222222222';
const SERIES_ID = '33333333-3333-4333-8333-333333333333';
const OCCURRENCE_ID = '44444444-4444-4444-8444-444444444444';
const DELETE_MUTATION_ID = '55555555-5555-4555-8555-555555555555';

function occurrence() {
  return {
    id: OCCURRENCE_ID,
    seriesId: SERIES_ID,
    schedule: {
      localStart: '2026-09-14T09:15:00',
      localFinish: '2026-09-14T10:00:00',
      startInstant: '2026-09-14T01:15:00.000Z',
      finishInstant: '2026-09-14T02:00:00.000Z',
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
  };
}

async function seedDeletionFixture(database) {
  await applyMobileMigrations(database);
  await database.runAsync(
    `INSERT INTO local_accounts
      (account_id, created_at, language, trust_mode, app_time_zone)
     VALUES (?, ?, 'en', 0, 'Asia/Hong_Kong')`,
    ACCOUNT_ID,
    '2026-09-12T00:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO cached_mission_series
      (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ACCOUNT_ID,
    SERIES_ID,
    'Delete me',
    'Asia/Hong_Kong',
    JSON.stringify({ id: SERIES_ID, title: 'Delete me', recurrence: null }),
    '2026-09-12T00:00:00.000Z',
  );
  const mission = occurrence();
  await database.runAsync(
    `INSERT INTO cached_mission_occurrences
      (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end,
       all_day, payload_json, server_version, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, 4, ?)`,
    ACCOUNT_ID,
    OCCURRENCE_ID,
    SERIES_ID,
    '2026-09-14',
    mission.schedule.startInstant,
    mission.schedule.finishInstant,
    JSON.stringify(mission),
    '2026-09-12T00:00:00.000Z',
  );
  await database.runAsync(
    `INSERT INTO notification_registry
      (account_id, notification_id, occurrence_id, scheduled_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    ACCOUNT_ID,
    'native-before-delete',
    OCCURRENCE_ID,
    mission.schedule.startInstant,
    '2026-09-12T00:00:00.000Z',
  );
}

async function deleteFixtureMission(database) {
  return deleteCalendarMission({
    database,
    accountId: ACCOUNT_ID,
    deviceId: DEVICE_ID,
    occurrenceId: OCCURRENCE_ID,
    now: new Date('2026-09-12T01:00:00.000Z'),
    generateId: () => DELETE_MUTATION_ID,
  });
}

describe('MTS-065 deletion notification rebuild integration', () => {
  it(
    'keeps the native registry identity until reconciliation cancels the obsolete reminder',
    async () => {
      const database = createDatabase();
      await seedDeletionFixture(database);

      await deleteFixtureMission(database);

      expect(
        await database.getFirstAsync(
          `SELECT notification_id
             FROM notification_registry
            WHERE account_id = ? AND occurrence_id = ?`,
          ACCOUNT_ID,
          OCCURRENCE_ID,
        ),
      ).toEqual({ notification_id: 'native-before-delete' });

      const cancel = vi.fn(async () => undefined);
      const schedule = vi.fn(async () => 'unexpected-native');
      const reconciler = createMissionNotificationReconciler({
        database,
        accountId: ACCOUNT_ID,
        scheduler: { cancel, schedule, cancelAll: vi.fn() },
      });

      await reconciler.reconcile({
        now: '2026-09-12T01:00:00.000Z',
        horizonEnd: '2026-09-20T01:00:00.000Z',
      });

      expect(cancel).toHaveBeenCalledWith('native-before-delete');
      expect(schedule).not.toHaveBeenCalled();
      expect(
        await database.getFirstAsync(
          `SELECT notification_id
             FROM notification_registry
            WHERE account_id = ? AND occurrence_id = ?`,
          ACCOUNT_ID,
          OCCURRENCE_ID,
        ),
      ).toBeNull();
    },
  );

  it(
    'publishes a mission-change observation after undo commits so a cancelled reminder can be rebuilt',
    async () => {
      const database = createDatabase();
      await seedDeletionFixture(database);
      const deletion = await deleteFixtureMission(database);
      const observed = [];
      const unsubscribe = subscribeLocalMutationApplied((event) => observed.push(event.entityType));

      try {
        await expect(
          undoCalendarMissionDeletion({ database, accountId: ACCOUNT_ID, deletion }),
        ).resolves.toBe(true);
      } finally {
        unsubscribe();
      }

      expect(observed).toEqual(['mission']);
    },
  );
});
