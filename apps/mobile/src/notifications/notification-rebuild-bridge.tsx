import { useEffect } from 'react';
import { AppState } from 'react-native';

import { rootNotificationRebuildLifecycle } from './root-notification-rebuild-runtime.js';

export function NotificationRebuildBridge() {
  useEffect(() => {
    void rootNotificationRebuildLifecycle.start().catch(() => undefined);
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        void rootNotificationRebuildLifecycle.onForeground().catch(() => undefined);
      }
    });

    return () => {
      subscription.remove();
      rootNotificationRebuildLifecycle.stop();
    };
  }, []);

  return null;
}
