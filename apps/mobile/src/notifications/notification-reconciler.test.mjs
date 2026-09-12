import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMissionNotificationReconciler } from './notification-reconciler.js';
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

const ACCOUNT_A = '123e4567-e89b-42d3-a456-426614174000';
const ACCOUNT_B = '123e4567-e89b-42d3-a456-426614174001';
const SERIES_ONE_TIME = '223e4567-e89b-42d3-a456-426614174000';
const SERIES_RECURRING = '223e4567-e89b-42d3-a456-426614174001';

function occurrenceId(index) {
  return `323e4567-e89b-42d3-a456-${String(index).padStart(12, '0')}`;
}

function buildOccurrence({
  id,
  seriesId = SERIES_ONE_TIME,
  localDate,
  startInstant,
  finishInstant,
  timeZone = 'Asia/Hong_Kong',
  allDay = false,
  scheduleState = 'scheduled',
  completionState = 'incomplete',
  deletionState = 'active',
}) {
  return {
    id,
    seriesId,
    schedule: {
      localStart: allDay ? `${localDate}T00:00:00` : `${localDate}T10:00:00`,
      localFinish: allDay ? `${localDate}T23:59:59` : `${localDate}T10:30:00`,
      startInstant,
      finishInstant,
      timeZone,
      timeBehavior: 'local_time',
      allDay,
      estimatedEffortMinutes: allDay ? 60 : null,
    },
    scheduleState,
    completionState,
    evidenceState: 'not_submitted',
    rewardEligibility: 'eligible',
    rewardIssuance: 'not_issued',
    calendarSource: 'internal',
    fieldOwnership: 'app_owned',
    synchronizationState: 'synced',
    storyState: 'none',
    deletionState,
  };
}

async function seedAccount(database, accountId, language = 'en') {
  await database.runAsync(
    `INSERT INTO local_accounts (account_id, created_at, language)
     VALUES (?, ?, ?)`,
    accountId,
    '2026-09-12T00:00:00.000Z',
    language,
  );
}

async function seedSeries(database, accountId, { id, title, recurrence = null }) {
  await database.runAsync(
    `INSERT INTO cached_mission_series
      (account_id, series_id, title, timezone, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    accountId,
    id,
    title,
    'Asia/Hong_Kong',
    JSON.stringify({ id, title, recurrence }),
    '2026-09-12T00:00:00.000Z',
  );
}

async function seedOccurrence(database, accountId, occurrence) {
  await database.runAsync(
    `INSERT INTO cached_mission_occurrences
      (account_id, occurrence_id, series_id, local_date, scheduled_start, scheduled_end, all_day, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    accountId,
    occurrence.id,
    occurrence.seriesId,
    occurrence.schedule.localStart.slice(0, 10),
    occurrence.schedule.allDay ? null : occurrence.schedule.startInstant,
    occurrence.schedule.allDay ? null : occurrence.schedule.finishInstant,
    occurrence.schedule.allDay ? 1 : 0,
    JSON.stringify(occurrence),
    '2026-09-12T00:00:00.000Z',
  );
}

function nativeHarness() {
  const scheduleCalls = [];
  const cancel = vi.fn(async () => undefined);
  let nextId = 1;
  return {
    cancel,
    scheduleCalls,
    scheduler: {
      cancel,
      schedule: vi.fn(async (request) => {
        scheduleCalls.push(request);
        const id = `native-${String(nextId)}`;
        nextId += 1;
        return id;
      }),
    },
  };
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('MTS-063 local notification registry and rolling horizon', () => {
  it('schedules timed missions at start, all-day missions at 09:00 mission zone, and excludes past/ineligible/out-of-horizon occurrences', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedAccount(database, ACCOUNT_A, 'zh-HK');
    await seedSeries(database, ACCOUNT_A, {
      id: SERIES_ONE_TIME,
      title: '準時任務',
    });
    await seedSeries(database, ACCOUNT_A, {
      id: SERIES_RECURRING,
      title: '無限重複',
      recurrence: { pattern: { type: 'daily', interval: 1 }, end: { type: 'never' } },
    });

    await seedOccurrence(
      database,
      ACCOUNT_A,
      buildOccurrence({
        id: occurrenceId(1),
        localDate: '2026-09-13',
        startInstant: '2026-09-13T02:00:00.000Z',
        finishInstant: '2026-09-13T02:30:00.000Z',
      }),
    );
    await seedOccurrence(
      database,
      ACCOUNT_A,
      buildOccurrence({
        id: occurrenceId(2),
        localDate: '2026-09-14',
        startInstant: '2026-09-13T16:00:00.000Z',
        finishInstant: '2026-09-14T16:00:00.000Z',
        allDay: true,
      }),
    );
    await seedOccurrence(
      database,
      ACCOUNT_A,
      buildOccurrence({
        id: occurrenceId(3),
        seriesId: SERIES_RECURRING,
        localDate: '2026-09-15',
        startInstant: '2026-09-15T02:00:00.000Z',
        finishInstant: '2026-09-15T02:30:00.000Z',
      }),
    );
    await seedOccurrence(
      database,
      ACCOUNT_A,
      buildOccurrence({
        id: occurrenceId(4),
        seriesId: SERIES_RECURRING,
        localDate: '2026-10-15',
        startInstant: '2026-10-15T02:00:00.000Z',
        finishInstant: '2026-10-15T02:30:00.000Z',
      }),
    );
    await seedOccurrence(
      database,
      ACCOUNT_A,
      buildOccurrence({
        id: occurrenceId(5),
        localDate: '2026-09-11',
        startInstant: '2026-09-11T02:00:00.000Z',
        finishInstant: '2026-09-11T02:30:00.000Z',
      }),
    );
    await seedOccurrence(
      database,
      ACCOUNT_A,
      buildOccurrence({
        id: occurrenceId(6),
        localDate: '2026-09-16',
        startInstant: '2026-09-16T02:00:00.000Z',
        finishInstant: '2026-09-16T02:30:00.000Z',
        completionState: 'completed',
      }),
    );

    const native = nativeHarness();
    const reconciler = createMissionNotificationReconciler({
      database,
      accountId: ACCOUNT_A,
      scheduler: native.scheduler,
    });

    await reconciler.reconcile({
      now: '2026-09-12T00:00:00.000Z',
      horizonEnd: '2026-09-20T00:00:00.000Z',
    });

    expect(native.scheduleCalls.map((call) => [call.occurrenceId, call.scheduledAt])).toEqual([
      [occurrenceId(1), '2026-09-13T02:00:00.000Z'],
      [occurrenceId(2), '2026-09-14T01:00:00.000Z'],
      [occurrenceId(3), '2026-09-15T02:00:00.000Z'],
    ]);
    expect(native.scheduleCalls.map((call) => call.body)).toEqual([
      '準時任務 現在開始。',
      '準時任務 現在開始。',
      '無限重複 現在開始。',
    ]);

    const rows = await database.getAllAsync(
      `SELECT occurrence_id, scheduled_at
         FROM notification_registry
        WHERE account_id = ?
        ORDER BY scheduled_at`,
      ACCOUNT_A,
    );
    expect(rows).toEqual([
      { occurrence_id: occurrenceId(1), scheduled_at: '2026-09-13T02:00:00.000Z' },
      { occurrence_id: occurrenceId(2), scheduled_at: '2026-09-14T01:00:00.000Z' },
      { occurrence_id: occurrenceId(3), scheduled_at: '2026-09-15T02:00:00.000Z' },
    ]);
  });

  it('reconciles idempotently, replaces changed schedules, and never duplicates an unchanged occurrence', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedAccount(database, ACCOUNT_A);
    await seedSeries(database, ACCOUNT_A, { id: SERIES_ONE_TIME, title: 'Mission' });
    const initial = buildOccurrence({
      id: occurrenceId(10),
      localDate: '2026-09-13',
      startInstant: '2026-09-13T02:00:00.000Z',
      finishInstant: '2026-09-13T02:30:00.000Z',
    });
    await seedOccurrence(database, ACCOUNT_A, initial);
    const native = nativeHarness();
    const reconciler = createMissionNotificationReconciler({
      database,
      accountId: ACCOUNT_A,
      scheduler: native.scheduler,
    });
    const window = {
      now: '2026-09-12T00:00:00.000Z',
      horizonEnd: '2026-09-20T00:00:00.000Z',
    };

    await reconciler.reconcile(window);
    await reconciler.reconcile(window);

    expect(native.scheduler.schedule).toHaveBeenCalledTimes(1);
    expect(native.cancel).not.toHaveBeenCalled();

    const moved = buildOccurrence({
      id: occurrenceId(10),
      localDate: '2026-09-13',
      startInstant: '2026-09-13T03:00:00.000Z',
      finishInstant: '2026-09-13T03:30:00.000Z',
    });
    await database.runAsync(
      `UPDATE cached_mission_occurrences
          SET scheduled_start = ?, scheduled_end = ?, payload_json = ?, updated_at = ?
        WHERE account_id = ? AND occurrence_id = ?`,
      moved.schedule.startInstant,
      moved.schedule.finishInstant,
      JSON.stringify(moved),
      '2026-09-12T01:00:00.000Z',
      ACCOUNT_A,
      moved.id,
    );

    await reconciler.reconcile(window);

    expect(native.cancel).toHaveBeenCalledTimes(1);
    expect(native.cancel).toHaveBeenCalledWith('native-1');
    expect(native.scheduler.schedule).toHaveBeenCalledTimes(2);
    const rows = await database.getAllAsync(
      `SELECT notification_id, occurrence_id, scheduled_at
         FROM notification_registry
        WHERE account_id = ?`,
      ACCOUNT_A,
    );
    expect(rows).toEqual([
      {
        notification_id: 'native-2',
        occurrence_id: occurrenceId(10),
        scheduled_at: '2026-09-13T03:00:00.000Z',
      },
    ]);
  });

  it('serializes concurrent reconciliation and isolates each account registry', async () => {
    const database = createDatabase();
    await applyMobileMigrations(database);
    await seedAccount(database, ACCOUNT_A);
    await seedAccount(database, ACCOUNT_B);
    await seedSeries(database, ACCOUNT_A, { id: SERIES_ONE_TIME, title: 'A' });
    const seriesB = '223e4567-e89b-42d3-a456-426614174099';
    await seedSeries(database, ACCOUNT_B, { id: seriesB, title: 'B' });
    await seedOccurrence(
      database,
      ACCOUNT_A,
      buildOccurrence({
        id: occurrenceId(20),
        localDate: '2026-09-13',
        startInstant: '2026-09-13T02:00:00.000Z',
        finishInstant: '2026-09-13T02:30:00.000Z',
      }),
    );
    const occurrenceB = buildOccurrence({
      id: '423e4567-e89b-42d3-a456-426614174020',
      seriesId: seriesB,
      localDate: '2026-09-13',
      startInstant: '2026-09-13T04:00:00.000Z',
      finishInstant: '2026-09-13T04:30:00.000Z',
    });
    await seedOccurrence(database, ACCOUNT_B, occurrenceB);
    await database.runAsync(
      `INSERT INTO notification_registry
        (account_id, notification_id, occurrence_id, scheduled_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      ACCOUNT_B,
      'other-account-notification',
      occurrenceB.id,
      occurrenceB.schedule.startInstant,
      '2026-09-12T00:00:00.000Z',
    );

    const native = nativeHarness();
    const reconciler = createMissionNotificationReconciler({
      database,
      accountId: ACCOUNT_A,
      scheduler: native.scheduler,
    });
    const window = {
      now: '2026-09-12T00:00:00.000Z',
      horizonEnd: '2026-09-20T00:00:00.000Z',
    };

    await Promise.all([reconciler.reconcile(window), reconciler.reconcile(window)]);

    expect(native.scheduler.schedule).toHaveBeenCalledTimes(1);
    expect(native.cancel).not.toHaveBeenCalledWith('other-account-notification');
    expect(
      await database.getFirstAsync(
        `SELECT notification_id
           FROM notification_registry
          WHERE account_id = ? AND notification_id = ?`,
        ACCOUNT_B,
        'other-account-notification',
      ),
    ).toEqual({ notification_id: 'other-account-notification' });
  });
});
