import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  createGoogleCalendarWatchService,
  type GoogleCalendarWatchChannel,
  type GoogleCalendarWatchProvider,
  type GoogleCalendarWatchRegistration,
  type GoogleCalendarWatchStore,
} from './google-calendar-watch.js';

const NOW = new Date('2026-09-13T07:00:00.000Z');
const WEBHOOK_ADDRESS = 'https://example.test/v1/calendars/google/webhook';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function channel(overrides: Partial<GoogleCalendarWatchChannel> = {}): GoogleCalendarWatchChannel {
  return {
    connectionId: CONNECTION_ID,
    channelId: 'channel-old',
    resourceId: 'resource-1',
    tokenHash: tokenHash('secret-token'),
    expiresAt: new Date('2026-09-13T09:00:00.000Z'),
    ...overrides,
  };
}

function createHarness(
  input: Readonly<{
    storedChannel?: GoogleCalendarWatchChannel | null;
    dueChannels?: readonly GoogleCalendarWatchChannel[];
    hasCurrentChannel?: boolean;
  }> = {},
) {
  const seen = new Set<string>();
  const scheduledWork: string[] = [];
  const savedChannels: GoogleCalendarWatchRegistration[] = [];
  const renewedChannels: GoogleCalendarWatchRegistration[] = [];

  const store: GoogleCalendarWatchStore = {
    getChannel: vi.fn(async () => input.storedChannel ?? channel()),
    schedulePullOnce: vi.fn(async ({ connectionId, channelId, messageNumber }) => {
      const key = `${channelId}:${messageNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      scheduledWork.push(connectionId);
      return true;
    }),
    hasCurrentChannel: vi.fn(async () => input.hasCurrentChannel ?? false),
    saveChannel: vi.fn(async ({ channel: saved }) => {
      savedChannels.push(saved);
    }),
    listChannelsDueForRenewal: vi.fn(async () => input.dueChannels ?? []),
    markRenewed: vi.fn(async ({ replacement }) => {
      renewedChannels.push(replacement);
    }),
  };

  const provider: GoogleCalendarWatchProvider = {
    watchEvents: vi.fn(async ({ channelId }) => ({
      resourceId: `resource-for-${channelId}`,
      expiresAt: new Date('2026-09-20T07:00:00.000Z'),
    })),
  };

  const service = createGoogleCalendarWatchService({
    store,
    provider,
    webhookAddress: WEBHOOK_ADDRESS,
    now: () => NOW,
    createChannelId: () => 'channel-new',
    createChannelToken: () => 'new-secret-token',
    renewalLeadMs: 6 * 60 * 60 * 1_000,
  });

  return { service, store, provider, scheduledWork, savedChannels, renewedChannels };
}

describe('MTS-071 Google Calendar webhook', () => {
  it('uses verified headers and ignores the body', async () => {
    const { service, store, scheduledWork } = createHarness();

    await expect(
      service.handleWebhook({
        channelId: 'channel-old',
        resourceId: 'resource-1',
        channelToken: 'secret-token',
        messageNumber: '42',
        resourceState: 'exists',
        body: { fabricated: ['event', 'payload'] },
      }),
    ).resolves.toEqual({ accepted: true, scheduled: true });

    expect(store.schedulePullOnce).toHaveBeenCalledWith({
      connectionId: CONNECTION_ID,
      channelId: 'channel-old',
      messageNumber: '42',
      resourceState: 'exists',
    });
    expect(scheduledWork).toEqual([CONNECTION_ID]);
  });

  it('deduplicates retried messages', async () => {
    const { service, scheduledWork } = createHarness();
    const message = {
      channelId: 'channel-old',
      resourceId: 'resource-1',
      channelToken: 'secret-token',
      messageNumber: '43',
      resourceState: 'exists',
      body: null,
    } as const;

    await expect(service.handleWebhook(message)).resolves.toEqual({
      accepted: true,
      scheduled: true,
    });
    await expect(service.handleWebhook({ ...message, body: 'different' })).resolves.toEqual({
      accepted: true,
      scheduled: false,
    });
    expect(scheduledWork).toHaveLength(1);
  });

  it.each([
    ['unknown channel', null, 'resource-1', 'secret-token'],
    ['wrong resource', channel(), 'resource-wrong', 'secret-token'],
    ['wrong token', channel(), 'resource-1', 'wrong-token'],
    [
      'expired channel',
      channel({ expiresAt: new Date('2026-09-13T06:59:59.999Z') }),
      'resource-1',
      'secret-token',
    ],
  ])('rejects %s safely', async (_name, stored, resourceId, channelToken) => {
    const { service, store, scheduledWork } = createHarness({ storedChannel: stored });

    await expect(
      service.handleWebhook({
        channelId: 'channel-old',
        resourceId,
        channelToken,
        messageNumber: '44',
        resourceState: 'exists',
      }),
    ).resolves.toEqual({ accepted: false, scheduled: false });
    expect(store.schedulePullOnce).not.toHaveBeenCalled();
    expect(scheduledWork).toEqual([]);
  });
});

describe('MTS-071 Google Calendar watch lifecycle', () => {
  it('creates a channel with a hashed token', async () => {
    const { service, provider, savedChannels } = createHarness();

    await service.ensureChannel(CONNECTION_ID);

    expect(provider.watchEvents).toHaveBeenCalledWith({
      connectionId: CONNECTION_ID,
      channelId: 'channel-new',
      channelToken: 'new-secret-token',
      webhookAddress: WEBHOOK_ADDRESS,
    });
    expect(savedChannels).toEqual([
      {
        channelId: 'channel-new',
        resourceId: 'resource-for-channel-new',
        tokenHash: tokenHash('new-secret-token'),
        expiresAt: new Date('2026-09-20T07:00:00.000Z'),
      },
    ]);
  });

  it('does not create a duplicate current channel', async () => {
    const { service, provider } = createHarness({ hasCurrentChannel: true });

    await service.ensureChannel(CONNECTION_ID);

    expect(provider.watchEvents).not.toHaveBeenCalled();
  });

  it('renews before expiry in bounded batches', async () => {
    const oldChannel = channel({ expiresAt: new Date('2026-09-13T12:00:00.000Z') });
    const { service, store, provider, renewedChannels } = createHarness({
      dueChannels: [oldChannel],
    });

    await expect(service.renewDueChannels(25)).resolves.toBe(1);

    expect(store.listChannelsDueForRenewal).toHaveBeenCalledWith({
      before: new Date('2026-09-13T13:00:00.000Z'),
      limit: 25,
    });
    expect(provider.watchEvents).toHaveBeenCalledTimes(1);
    expect(renewedChannels).toEqual([
      {
        channelId: 'channel-new',
        resourceId: 'resource-for-channel-new',
        tokenHash: tokenHash('new-secret-token'),
        expiresAt: new Date('2026-09-20T07:00:00.000Z'),
      },
    ]);
  });

  it('rejects an unbounded renewal batch size', async () => {
    const { service } = createHarness();

    await expect(service.renewDueChannels(0)).rejects.toThrow(
      'google_calendar_watch_limit_invalid',
    );
    await expect(service.renewDueChannels(501)).rejects.toThrow(
      'google_calendar_watch_limit_invalid',
    );
  });
});
