import { describe, expect, it, vi } from 'vitest';

import {
  createNotificationRebuildCoordinator,
  createNotificationRebuildLifecycle,
  requiresForcedNotificationReschedule,
} from './notification-rebuild-runtime.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

// prettier-ignore
describe('MTS-065 notification rebuild runtime', () => {
  it('batches same-turn rebuild triggers', async () => {
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

  it('queues one follow-up batch during an active rebuild', async () => {
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

  it('does not strand a trigger queued during successful drain handoff', async () => {
    const firstRun = deferred();
    const rebuild = vi.fn(async () => undefined);
    rebuild.mockImplementationOnce(async () => firstRun.promise);
    const runtime = createNotificationRebuildCoordinator({ rebuild });

    const first = runtime.request('mission-change');
    await Promise.resolve();

    let handoff;
    firstRun.resolve();
    queueMicrotask(() => {
      handoff = runtime.request('synchronization');
    });

    await first;
    await handoff;

    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(rebuild.mock.calls[1]?.[0]).toEqual(['synchronization']);
  });

  it('preserves failed recovery reasons without launching an implicit retry', async () => {
    const firstRun = deferred();
    const rebuild = vi.fn(async () => undefined);
    rebuild.mockImplementationOnce(async () => firstRun.promise);
    const runtime = createNotificationRebuildCoordinator({ rebuild });

    const first = runtime.request('device-reboot');
    await Promise.resolve();
    const queued = runtime.request('synchronization');
    firstRun.reject(new Error('offline'));

    await expect(first).rejects.toThrow('offline');
    await expect(queued).rejects.toThrow('offline');
    await Promise.resolve();
    await Promise.resolve();

    expect(rebuild).toHaveBeenCalledTimes(1);

    await runtime.request('time-zone-change');

    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(rebuild.mock.calls[1]?.[0]).toEqual([
      'device-reboot',
      'synchronization',
      'time-zone-change',
    ]);
  });

  it('forces native re-registration only for recovery or time-zone reasons', () => {
    expect(requiresForcedNotificationReschedule(['device-reboot'])).toBe(true);
    expect(requiresForcedNotificationReschedule(['permission-restored'])).toBe(true);
    expect(requiresForcedNotificationReschedule(['time-zone-change'])).toBe(true);
    expect(requiresForcedNotificationReschedule(['sign-in'])).toBe(false);
    expect(requiresForcedNotificationReschedule(['mission-change', 'synchronization'])).toBe(false);
  });

  it('wires every notification rebuild lifecycle trigger', async () => {
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
    mutationListener?.({ entityType: 'completion' });
    mutationListener?.({ entityType: 'settings' });
    mutationListener?.({ entityType: 'story' });
    await lifecycle.afterSynchronization(true);
    await lifecycle.onForeground();

    expect(request).toHaveBeenCalledWith('mission-change');
    expect(request).toHaveBeenCalledWith('time-zone-change');
    expect(request).toHaveBeenCalledWith('synchronization');
    expect(request).toHaveBeenCalledWith('permission-restored');
    expect(request.mock.calls.filter(([reason]) => reason === 'time-zone-change')).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(7);

    lifecycle.stop();
    expect(mutationListener).toBeNull();
  });

  it('keeps device-local coordinators independent', async () => {
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
