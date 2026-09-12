import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-notifications', () => ({
  cancelAllScheduledNotificationsAsync: vi.fn(async () => undefined),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
  scheduleNotificationAsync: vi.fn(async () => 'native-42'),
}));

import * as Notifications from 'expo-notifications';

import { rootMissionNotificationScheduler } from './expo-mission-notifications.js';

describe('MTS-063 Expo mission notification scheduler', () => {
  it('schedules one local notification at the exact requested instant with occurrence identity', async () => {
    await expect(
      rootMissionNotificationScheduler.schedule({
        occurrenceId: '323e4567-e89b-42d3-a456-426614174000',
        scheduledAt: '2026-09-13T02:00:00.000Z',
        body: 'Mission starts now.',
      }),
    ).resolves.toBe('native-42');

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        body: 'Mission starts now.',
        data: { occurrenceId: '323e4567-e89b-42d3-a456-426614174000' },
      },
      trigger: new Date('2026-09-13T02:00:00.000Z'),
    });
  });

  it('cancels one or all native scheduled notifications through the Expo boundary', async () => {
    await rootMissionNotificationScheduler.cancel('native-42');
    await rootMissionNotificationScheduler.cancelAll();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('native-42');
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  });
});
