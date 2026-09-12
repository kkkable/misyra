import { describe, expect, it } from 'vitest';

import { createMissionNotificationReconciler } from './notification-reconciler.js';

describe('MTS-063 rolling notification horizon bound', () => {
  it('rejects a reconciliation window wider than 30 days', async () => {
    const reconciler = createMissionNotificationReconciler({
      database: {},
      accountId: '123e4567-e89b-42d3-a456-426614174000',
      scheduler: {},
    });

    await expect(
      reconciler.reconcile({
        now: '2026-09-01T00:00:00.000Z',
        horizonEnd: '2026-10-02T00:00:00.000Z',
      }),
    ).rejects.toThrow('notification_horizon_exceeds_maximum');
  });
});
