import { describe, expect, it, vi } from 'vitest';

import {
  createGoogleCalendarWatchService,
  type GoogleCalendarWatchStore,
} from './google-calendar-watch.js';

const missingConnectionId = '11111111-1111-4111-8111-111111111111';
const dueConnectionId = '22222222-2222-4222-8222-222222222222';

function maintenanceStore() {
  const missingClaims = [missingConnectionId];
  const dueChannels = [
    {
      connectionId: dueConnectionId,
      channelId: 'channel-due',
      resourceId: 'resource-due',
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date('2026-09-13T08:00:00.000Z'),
    },
  ];
  const markRenewed = vi.fn().mockResolvedValue(undefined);

  const store: GoogleCalendarWatchStore = {
    getChannel: vi.fn().mockResolvedValue(null),
    schedulePullOnce: vi.fn().mockResolvedValue(false),
    hasCurrentChannel: vi.fn().mockResolvedValue(false),
    saveChannel: vi.fn().mockResolvedValue(undefined),
    claimConnectionMissingChannel: vi.fn(() => Promise.resolve(missingClaims.shift() ?? null)),
    listChannelsDueForRenewal: vi.fn(() => Promise.resolve(dueChannels.splice(0, 1))),
    markRenewed,
  };
  return { store, markRenewed };
}

describe('MTS-071 Google watch maintenance failure isolation', () => {
  it('still renews due channels when a missing-watch repair provider call fails', async () => {
    const { store, markRenewed } = maintenanceStore();
    const watchEvents = vi.fn((input: { connectionId: string }) => {
      if (input.connectionId === missingConnectionId) {
        return Promise.reject(new Error('missing-watch-provider-failed'));
      }
      return Promise.resolve({
        resourceId: 'replacement-resource',
        expiresAt: new Date('2026-09-20T07:00:00.000Z'),
      });
    });
    const channelIds = ['repair-channel', 'renewal-channel'];
    const service = createGoogleCalendarWatchService({
      store,
      provider: { watchEvents },
      webhookAddress: 'https://example.test/v1/webhooks/google-calendar',
      now: () => new Date('2026-09-13T07:00:00.000Z'),
      createChannelId: () => channelIds.shift() ?? 'fallback-channel',
      createChannelToken: () => 'fixture-channel-token',
    });

    await expect(service.renewDueChannels(2)).rejects.toThrow('missing-watch-provider-failed');
    expect(watchEvents).toHaveBeenCalledTimes(2);
    expect(markRenewed).toHaveBeenCalledTimes(1);
  });
});
