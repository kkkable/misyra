import { rootAuthController } from '../auth/auth-runtime.js';
import { rootOnboardingNotificationChannelName } from '../onboarding/onboarding-runtime.js';
import { openMobileDatabase } from '../storage/database.js';
import { subscribeLocalMutationApplied } from '../storage/mutation-queue.js';
import { createExpoNotificationPermissionService } from './expo-notification-permission.js';
import { rootMissionNotificationScheduler } from './expo-mission-notifications.js';
import {
  createNotificationRebuildCoordinator,
  createNotificationRebuildLifecycle,
  requiresForcedNotificationReschedule,
  type NotificationRebuildReason,
} from './notification-rebuild-runtime.js';
import { createMissionNotificationReconciler } from './notification-reconciler.js';

const NOTIFICATION_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

export const rootNotificationPermissionService = createExpoNotificationPermissionService({
  androidChannelName: rootOnboardingNotificationChannelName,
});

async function rebuildNotifications(reasons: readonly NotificationRebuildReason[]): Promise<void> {
  const permission = await rootNotificationPermissionService.getStatus();
  if (permission.status !== 'enabled') return;

  const authState = await rootAuthController.restore();
  if (authState.status !== 'signed_in') return;

  const database = await openMobileDatabase();
  const reconciler = createMissionNotificationReconciler({
    database,
    accountId: authState.session.accountId,
    scheduler: rootMissionNotificationScheduler,
  });
  const now = new Date();
  const forceReschedule = requiresForcedNotificationReschedule(reasons);

  await reconciler.reconcile({
    now: now.toISOString(),
    horizonEnd: new Date(now.getTime() + NOTIFICATION_HORIZON_MS).toISOString(),
    forceReschedule,
  });
}

export const rootNotificationRebuildCoordinator = createNotificationRebuildCoordinator({
  rebuild: rebuildNotifications,
});

export const rootNotificationRebuildLifecycle = createNotificationRebuildLifecycle({
  request: (reason) => rootNotificationRebuildCoordinator.request(reason),
  permissionService: rootNotificationPermissionService,
  subscribeLocalMutation: subscribeLocalMutationApplied,
});
