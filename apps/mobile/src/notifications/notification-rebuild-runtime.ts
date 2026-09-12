import type { NotificationPermissionService } from './notification-permission.js';

export type NotificationRebuildReason =
  | 'sign-in'
  | 'device-reboot'
  | 'mission-change'
  | 'time-zone-change'
  | 'permission-restored'
  | 'synchronization';

export type NotificationRebuildMutationEvent = Readonly<{
  entityType: string;
}>;

type Rebuild = (reasons: readonly NotificationRebuildReason[]) => Promise<void>;
type RequestRebuild = (reason: NotificationRebuildReason) => Promise<void>;
type SubscribeLocalMutation = (
  listener: (event: NotificationRebuildMutationEvent) => void,
) => () => void;

export function createNotificationRebuildCoordinator({ rebuild }: Readonly<{ rebuild: Rebuild }>) {
  const pendingReasons = new Set<NotificationRebuildReason>();
  let activeDrain: Promise<void> | null = null;

  const ensureDrain = (): Promise<void> => {
    if (activeDrain !== null) return activeDrain;

    activeDrain = Promise.resolve()
      .then(async () => {
        while (pendingReasons.size > 0) {
          const reasons = Object.freeze([...pendingReasons]);
          pendingReasons.clear();
          await rebuild(reasons);
        }
      })
      .finally(() => {
        activeDrain = null;
        if (pendingReasons.size > 0) void ensureDrain();
      });
    return activeDrain;
  };

  return Object.freeze({
    request(reason: NotificationRebuildReason): Promise<void> {
      pendingReasons.add(reason);
      return ensureDrain();
    },
  });
}

export function createNotificationRebuildLifecycle({
  request,
  permissionService,
  subscribeLocalMutation,
}: Readonly<{
  request: RequestRebuild;
  permissionService: Pick<NotificationPermissionService, 'getStatus'>;
  subscribeLocalMutation: SubscribeLocalMutation;
}>) {
  let previousPermissionStatus: Awaited<
    ReturnType<NotificationPermissionService['getStatus']>
  >['status'] | null = null;
  let unsubscribeMutation: (() => void) | null = null;

  const requestWithoutBlockingMutation = (reason: NotificationRebuildReason) => {
    void request(reason).catch(() => undefined);
  };

  return Object.freeze({
    async start(): Promise<void> {
      if (unsubscribeMutation !== null) return;
      previousPermissionStatus = (await permissionService.getStatus()).status;
      unsubscribeMutation = subscribeLocalMutation((event) => {
        if (event.entityType === 'mission') requestWithoutBlockingMutation('mission-change');
        if (event.entityType === 'settings') requestWithoutBlockingMutation('time-zone-change');
      });
      await Promise.all([request('sign-in'), request('device-reboot')]);
    },

    async afterSynchronization(timeZoneChanged = false): Promise<void> {
      if (timeZoneChanged) {
        await Promise.all([request('synchronization'), request('time-zone-change')]);
        return;
      }
      await request('synchronization');
    },

    async onForeground(): Promise<void> {
      const nextPermission = await permissionService.getStatus();
      const restored =
        previousPermissionStatus !== null &&
        previousPermissionStatus !== 'enabled' &&
        nextPermission.status === 'enabled';
      previousPermissionStatus = nextPermission.status;
      if (restored) await request('permission-restored');
    },

    stop(): void {
      unsubscribeMutation?.();
      unsubscribeMutation = null;
      previousPermissionStatus = null;
    },
  });
}
