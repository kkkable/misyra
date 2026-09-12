import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

import { handleMissionNotificationData } from './notification-response-handler.js';

export function MissionNotificationResponseBridge() {
  const router = useRouter();
  const handledResponseIds = useRef(new Set<string>());

  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse): boolean => {
      const responseId = response.notification.request.identifier;
      if (handledResponseIds.current.has(responseId)) return false;

      const navigated = handleMissionNotificationData(
        response.notification.request.content.data,
        (destination) => {
          router.push(destination);
        },
      );
      if (navigated) handledResponseIds.current.add(responseId);
      return navigated;
    };

    void Notifications.getLastNotificationResponseAsync()
      .then(async (response) => {
        if (response === null || !handleResponse(response)) return;
        await Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => undefined);

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleResponse(response);
    });
    return () => {
      subscription.remove();
    };
  }, [router]);

  return null;
}
