import { describe, expect, it, vi } from 'vitest';

import { createMissionNotificationReconciler } from './notification-reconciler.js';

const ACCOUNT_ID = '123e4567-e89b-42d3-a456-426614174000';
const SERIES_ID = '223e4567-e89b-42d3-a456-426614174000';
const OCCURRENCE_ID = '323e4567-e89b-42d3-a456-426614174000';

function occurrence() {
  return {
    id: OCCURRENCE_ID,
    seriesId: SERIES_ID,
    schedule: {
      localStart: '2026-09-14T09:00:00',
      localFinish: '2026-09-14T09:30:00',
      startInstant: '2026-09-14T01:00:00.000Z',
      finishInstant: '2026-09-14T01:30:00.000Z',
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

describe('MTS-065 notification rebuild reconciliation', () => {
  it('cancels the stored native reminder and registers the eligible future reminder again', async () => {
    const registry = [
      {
        notification_id: 'native-before-reboot',
        occurrence_id: OCCURRENCE_ID,
        scheduled_at: '2026-09-14T01:00:00.000Z',
      },
    ];
    const database = {
      async getFirstAsync() {
        return { language: 'en', app_time_zone: 'Asia/Hong_Kong' };
      },
      async getAllAsync(sql) {
        if (sql.includes('cached_mission_occurrences')) {
          return [{ payload_json: JSON.stringify(occurrence()), title: 'Stand-up' }];
        }
        if (sql.includes('notification_registry')) return [...registry];
        return [];
      },
      async runAsync(sql, ...params) {
        if (sql.includes('DELETE FROM notification_registry')) {
          const index = registry.findIndex((row) => row.notification_id === params[1]);
          if (index >= 0) registry.splice(index, 1);
        }
        if (sql.includes('INSERT INTO notification_registry')) {
          registry.push({
            notification_id: params[1],
            occurrence_id: params[2],
            scheduled_at: params[3],
          });
        }
      },
    };
    const cancel = vi.fn(async () => undefined);
    const schedule = vi.fn(async () => 'native-after-reboot');
    const reconciler = createMissionNotificationReconciler({
      database,
      accountId: ACCOUNT_ID,
      scheduler: { cancel, schedule, cancelAll: vi.fn() },
    });

    await reconciler.reconcile({
      now: '2026-09-12T00:00:00.000Z',
      horizonEnd: '2026-09-20T00:00:00.000Z',
      forceReschedule: true,
    });

    expect(cancel).toHaveBeenCalledWith('native-before-reboot');
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(registry).toEqual([
      {
        notification_id: 'native-after-reboot',
        occurrence_id: OCCURRENCE_ID,
        scheduled_at: '2026-09-14T01:00:00.000Z',
      },
    ]);
  });

  it('replaces a same-time reminder when its native payload changes but retains it when unchanged', async () => {
    const registry = [];
    let title = 'Stand-up';
    const database = {
      async getFirstAsync() {
        return { language: 'en', app_time_zone: 'Asia/Hong_Kong' };
      },
      async getAllAsync(sql) {
        if (sql.includes('cached_mission_occurrences')) {
          return [{ payload_json: JSON.stringify(occurrence()), title }];
        }
        if (sql.includes('notification_registry')) return [...registry];
        return [];
      },
      async runAsync(sql, ...params) {
        if (sql.includes('DELETE FROM notification_registry')) {
          const index = registry.findIndex((row) => row.notification_id === params[1]);
          if (index >= 0) registry.splice(index, 1);
        }
        if (sql.includes('INSERT INTO notification_registry')) {
          registry.push({
            notification_id: params[1],
            occurrence_id: params[2],
            scheduled_at: params[3],
          });
        }
      },
    };
    const cancel = vi.fn(async () => undefined);
    let nativeId = 0;
    const schedule = vi.fn(async () => `native-${++nativeId}`);
    const reconciler = createMissionNotificationReconciler({
      database,
      accountId: ACCOUNT_ID,
      scheduler: { cancel, schedule, cancelAll: vi.fn() },
    });
    const window = {
      now: '2026-09-12T00:00:00.000Z',
      horizonEnd: '2026-09-20T00:00:00.000Z',
    };

    await reconciler.reconcile(window);
    await reconciler.reconcile(window);

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();

    title = 'Planning';
    await reconciler.reconcile(window);

    expect(cancel).toHaveBeenCalledWith('native-1');
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(schedule.mock.calls[1]?.[0].body).toContain('Planning');
  });
});
