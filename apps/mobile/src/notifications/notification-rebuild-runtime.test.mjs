import { describe, expect, it, vi } from 'vitest';

import {
  createNotificationRebuildCoordinator,
  createNotificationRebuildLifecycle,
} from './notification-rebuild-runtime.js';

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('MTS-065 notification rebuild runtime', () => {
  it('batches same-turn lifecycle triggers into one rebuild without losing reasons', async () => {
    const rebuild = vi.fn(async () => undefined);
    const runtime = createNotificationRebuildCoordinator({ rebuild });

    await Promise.all([
      runtime.request('mission-change'),
      runtime.request('synchronization'),
      runtime.request('time-zone-change'),
    ]);

    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(rebuild).toHaveBeenCalledWith([
      'mission-change',
      'synchronization',
      'time-zone-change',
    ]);
  });

  it('runs at most one follow-up batch when changes arrive during an active rebuild', async () => {
    const firstRun = deferred();
    const rebuild = vi.fn(async () => undefined);
    rebuild.mockImplementationOnce(async () => firstRun.promise);
    const runtime = createNotificationRebuildCoordinator({ rebuild });

    const first = runtime.request('mission-change');
    await Promise.resolve();
    const second = runtime.request('synchronization');
    const third = runtime.request('time-zone-change');
    firstRun.resolve();

    await Promise.all([first, second, third]);

    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(rebuild.mock.calls[0]?.[0]).toEqual(['mission-change']);
    expect(rebuild.mock.calls[1]?.[0]).toEqual(['synchronization', 'time-zone-change']);
  });

  it(
    'wires sign-in, reboot, mission, time-zone, synchronization, and permission restoration triggers',
    async () => {
      let mutationListener = null;
      const request = vi.fn(async () => undefined);
      const permissionService = {
        getStatus: vi
          .fn()
          .mockResolvedValueOnce({ status: 'denied', canRequest: false })
          .mockResolvedValueOnce({ status: 'enabled', canRequest: false }),
      };
      const lifecycle = createNotificationRebuildLifecycle({
        request,
        permissionService,
        subscribeLocalMutation(listener) {
          mutationListener = listener;
          return () => {
            mutationListener = null;
          };
        },
      });

      await lifecycle.start();
      expect(request).toHaveBeenCalledWith('sign-in');
      expect(request).toHaveBeenCalledWith('device-reboot');

      mutationListener?.({ entityType: 'mission' });
      mutationListener?.({ entityType: 'settings' });
      mutationListener?.({ entityType: 'story' });
      await lifecycle.afterSynchronization();
      await lifecycle.onForeground();

      expect(request).toHaveBeenCalledWith('mission-change');
      expect(request).toHaveBeenCalledWith('time-zone-change');
      expect(request).toHaveBeenCalledWith('synchronization');
      expect(request).toHaveBeenCalledWith('permission-restored');
      expect(request).toHaveBeenCalledTimes(6);

      lifecycle.stop();
      expect(mutationListener).toBeNull();
    },
  );

  it('keeps rebuild batches independent across device-local runtime instances', async () => {
    const deviceARebuild = vi.fn(async () => undefined);
    const deviceBRebuild = vi.fn(async () => undefined);
    const deviceA = createNotificationRebuildCoordinator({ rebuild: deviceARebuild });
    const deviceB = createNotificationRebuildCoordinator({ rebuild: deviceBRebuild });

    await deviceA.request('mission-change');

    expect(deviceARebuild).toHaveBeenCalledTimes(1);
    expect(deviceBRebuild).not.toHaveBeenCalled();

    await deviceB.request('device-reboot');

    expect(deviceARebuild).toHaveBeenCalledTimes(1);
    expect(deviceBRebuild).toHaveBeenCalledTimes(1);
  });
});
