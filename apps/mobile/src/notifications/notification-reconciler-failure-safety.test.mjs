import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it, vi } from 'vitest';

import { createMissionNotificationReconciler } from './notification-reconciler.js';
import { applyMobileMigrations } from '../storage/schema.js';

const ACCOUNT_ID = '123e4567-e89b-42d3-a456-426614174000';
const SERIES_ID = '223e4567-e89b-42d3-a456-426614174000';
const OCCURRENCE_ID = '323e4567-e89b-42d3-a456-426614174000';

function occurrence(completionState = 'incomplete') {
  return {
    id: OCCURRENCE_ID,
    seriesId: SERIES_ID,
    schedule: {
      localStart: '2026-09-13T10:00:00',
      localFinish: '2026-09-13T10:30:00',
      startInstant: '2026-09-13T02:00:00.000Z',
      finishInstant: '2026-09-13T02:30:00.000Z',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'local_time',
      allDay: false,
      estimatedEffortMinutes: null,
    },
    scheduleState: 'scheduled',
    completionState,
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

describe('MTS-063 notification reconciliation failure safety', () => {
  it('cancels and removes a persisted reminder after its occurrence becomes completed', async () => {
    const sqlite = new DatabaseSync(':memory:');
    const database = {
      async execAsync(sql) {
        sqlite.exec(sql);
      },
      async runAsync(sql, ...params) {
        const result = sqlite.prepare(sql).run(...params);
        return { changes: Number(result.changes), lastInsertRowId: result.lastInsertRowid };
      },
      async getFirstAsync(sql, ...params) {
        return sqlite.prepare(sql).get(...params) ?? null;
      },
      async getAllAsync(sql, ...params) {
        return sqlite.prepare(sql).all(...params);
      },
      async withExclusiveTransactionAsync(task) {
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          await task(this);
          sqlite.exec('COMMIT');
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      },
    };

    try {
      await applyMobileMigrations(database);
      await database.runAsync(
        `INSERT INTO local_accounts (account_id, created_at, language) VALUES (?, ?, ?)`,
        ACCOUNT_ID,
        '2026-09-12T00:00:00.000Z',
        'en',
      );
      await database.runAsync(
        `INSERT INTO cached_mission_series
          (account_id, series_id, title, timezone, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ACCOUNT_ID,
        SERIES_ID,
        'Mission',
        'Asia/Hong_Kong',
        JSON.stringify({ id: SERIES_ID, title: 'Mission', recurrence: null }),
        '2026-09-12T00:00:00.000Z',
      );
      const completed = occurrence('completed');
      await database.runAsync(
        `INSERT INTO cached_mission_occurrences
          (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end, all_day, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ACCOUNT_ID,
        OCCURRENCE_ID,
        SERIES_ID,
        '2026-09-13',
        completed.schedule.startInstant,
        completed.schedule.finishInstant,
        0,
        JSON.stringify(completed),
        '2026-09-12T00:00:00.000Z',
      );
      await database.runAsync(
        `INSERT INTO notification_registry
          (account_id, notification_id, occurrence_id, scheduled_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        ACCOUNT_ID,
        'native-old',
        OCCURRENCE_ID,
        completed.schedule.startInstant,
        '2026-09-12T00:00:00.000Z',
      );

      const cancel = vi.fn(async () => undefined);
      const schedule = vi.fn();
      const reconciler = createMissionNotificationReconciler({
        database,
        accountId: ACCOUNT_ID,
        scheduler: { cancel, cancelAll: vi.fn(), schedule },
      });

      await reconciler.reconcile({
        now: '2026-09-12T00:00:00.000Z',
        horizonEnd: '2026-09-20T00:00:00.000Z',
      });

      expect(cancel).toHaveBeenCalledWith('native-old');
      expect(schedule).not.toHaveBeenCalled();
      expect(
        await database.getFirstAsync(
          `SELECT notification_id FROM notification_registry WHERE account_id = ?`,
          ACCOUNT_ID,
        ),
      ).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it('cancels a newly scheduled native notification when persisting its registry row fails', async () => {
    const candidate = occurrence();
    const persistenceFailure = new Error('registry_write_failed');
    const database = {
      getFirstAsync: vi.fn(async () => ({ language: 'en' })),
      getAllAsync: vi.fn(async (sql) => {
        if (sql.includes('cached_mission_occurrences')) {
          return [{ payload_json: JSON.stringify(candidate), title: 'Mission' }];
        }
        return [];
      }),
      runAsync: vi.fn(async () => {
        throw persistenceFailure;
      }),
    };
    const cancel = vi.fn(async () => undefined);
    const schedule = vi.fn(async () => 'native-orphan');
    const reconciler = createMissionNotificationReconciler({
      database,
      accountId: ACCOUNT_ID,
      scheduler: { cancel, cancelAll: vi.fn(), schedule },
    });

    await expect(
      reconciler.reconcile({
        now: '2026-09-12T00:00:00.000Z',
        horizonEnd: '2026-09-20T00:00:00.000Z',
      }),
    ).rejects.toBe(persistenceFailure);

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith('native-orphan');
  });
});
