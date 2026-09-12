import { describe, expect, it, vi } from 'vitest';

import { createMissionNotificationReconciler } from './notification-reconciler.js';

const ACCOUNT_ID = '123e4567-e89b-42d3-a456-426614174000';
const SERIES_ID = '223e4567-e89b-42d3-a456-426614174000';
const FIRST_ID = '323e4567-e89b-42d3-a456-426614174001';
const SECOND_ID = '323e4567-e89b-42d3-a456-426614174002';

function occurrence({ id, allDay = false }) {
  return {
    id,
    seriesId: SERIES_ID,
    schedule: {
      localStart: allDay ? '2026-09-14T00:00:00' : '2026-09-14T09:00:00',
      localFinish: allDay ? '2026-09-14T23:59:59' : '2026-09-14T09:30:00',
      startInstant: allDay ? '2026-09-13T16:00:00.000Z' : '2026-09-14T01:00:00.000Z',
      finishInstant: allDay ? '2026-09-14T16:00:00.000Z' : '2026-09-14T01:30:00.000Z',
      timeZone: 'Asia/Hong_Kong',
      timeBehavior: 'local_time',
      allDay,
      estimatedEffortMinutes: allDay ? 60 : null,
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

function createDatabase(rows) {
  const registry = [];
  return {
    registry,
    async getFirstAsync() {
      return { language: 'en' };
    },
    async getAllAsync(sql) {
      if (sql.includes('cached_mission_occurrences')) return rows;
      if (sql.includes('notification_registry')) return [...registry];
      return [];
    },
    async runAsync(sql, ...params) {
      if (sql.includes('INSERT INTO notification_registry')) {
        registry.push({
          notification_id: params[1],
          occurrence_id: params[2],
          scheduled_at: params[3],
        });
      }
      if (sql.includes('DELETE FROM notification_registry')) {
        const index = registry.findIndex((row) => row.notification_id === params[1]);
        if (index >= 0) registry.splice(index, 1);
      }
      return undefined;
    },
  };
}

describe('MTS-064 same-time combined notifications', () => {
  it('combines missions that resolve to the same exact trigger instant into one deterministic request', async () => {
    const database = createDatabase([
      {
        payload_json: JSON.stringify(occurrence({ id: SECOND_ID, allDay: true })),
        title: 'Private task',
      },
      { payload_json: JSON.stringify(occurrence({ id: FIRST_ID })), title: 'Stand-up' },
    ]);
    const schedule = vi.fn(async () => 'native-group');
    const reconciler = createMissionNotificationReconciler({
      database,
      accountId: ACCOUNT_ID,
      scheduler: { schedule, cancel: vi.fn(), cancelAll: vi.fn() },
    });

    await reconciler.reconcile({
      now: '2026-09-12T00:00:00.000Z',
      horizonEnd: '2026-09-20T00:00:00.000Z',
    });

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith({
      occurrenceIds: [FIRST_ID, SECOND_ID],
      scheduledAt: '2026-09-14T01:00:00.000Z',
      localDate: '2026-09-14',
      body: '2 missions start now',
    });
  });

  it('retains one unchanged combined native notification without scheduling duplicates', async () => {
    const rows = [
      { payload_json: JSON.stringify(occurrence({ id: FIRST_ID })), title: 'Stand-up' },
      {
        payload_json: JSON.stringify(occurrence({ id: SECOND_ID, allDay: true })),
        title: 'Private task',
      },
    ];
    const database = createDatabase(rows);
    const schedule = vi.fn(async () => 'native-group');
    const cancel = vi.fn(async () => undefined);
    const reconciler = createMissionNotificationReconciler({
      database,
      accountId: ACCOUNT_ID,
      scheduler: { schedule, cancel, cancelAll: vi.fn() },
    });
    const window = {
      now: '2026-09-12T00:00:00.000Z',
      horizonEnd: '2026-09-20T00:00:00.000Z',
    };

    await reconciler.reconcile(window);
    await reconciler.reconcile(window);

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });
});
