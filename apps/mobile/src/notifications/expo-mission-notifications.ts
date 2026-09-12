import * as Notifications from 'expo-notifications';

import type { MissionNotificationScheduler } from './notification-reconciler.js';

export const rootMissionNotificationScheduler: MissionNotificationScheduler = Object.freeze({
  async schedule(request) {
    const data =
      request.occurrenceIds.length > 0
        ? {
            localDate: request.localDate,
            occurrenceIds: Array.from(request.occurrenceIds),
          }
        : { occurrenceId: request.occurrenceId };

    return Notifications.scheduleNotificationAsync({
      content: {
        body: request.body,
        data,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(request.scheduledAt),
      },
    });
  },
  async cancel(notificationId) {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  },
  async cancelAll() {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },
});
