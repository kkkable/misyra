import type {
  NotificationPermissionService,
  NotificationPermissionStatus,
} from './notification-permission.js';

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
  let previousPermissionStatus: NotificationPermissionStatus['status'] | null = null;
  let unsubscribeMutation: (() => void) | null = null;
  let startGeneration = 0;
  let starting: Promise<void> | null = null;

  const requestWithoutBlockingMutation = (reason: NotificationRebuildReason) => {
    void request(reason).catch(() => undefined);
  };

  return Object.freeze({
    start(): Promise<void> {
      if (unsubscribeMutation !== null) return Promise.resolve();
      if (starting !== null) return starting;

      const generation = startGeneration + 1;
      startGeneration = generation;
      const run = (async () => {
        const status = (await permissionService.getStatus()).status;
        if (generation !== startGeneration) return;

        previousPermissionStatus = status;
        unsubscribeMutation = subscribeLocalMutation((event) => {
          if (event.entityType === 'mission' || event.entityType === 'completion') {
            requestWithoutBlockingMutation('mission-change');
          }
          if (event.entityType === 'settings') requestWithoutBlockingMutation('time-zone-change');
        });
        await Promise.all([request('sign-in'), request('device-reboot')]);
      })();

      starting = run.finally(() => {
        if (generation === startGeneration) starting = null;
      });
      return starting;
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
      startGeneration += 1;
      starting = null;
      unsubscribeMutation?.();
      unsubscribeMutation = null;
      previousPermissionStatus = null;
    },
  });
}
