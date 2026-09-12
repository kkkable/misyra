import * as Notifications from 'expo-notifications';

import type { MissionNotificationScheduler } from './notification-reconciler.js';

export const rootMissionNotificationScheduler: MissionNotificationScheduler = Object.freeze({
  async schedule(request) {
    return Notifications.scheduleNotificationAsync({
      content: {
        body: request.body,
        data: { occurrenceId: request.occurrenceId },
      },
      trigger: new Date(request.scheduledAt),
    });
  },
  async cancel(notificationId) {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  },
  async cancelAll() {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },
});
