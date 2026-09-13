import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  createGoogleCalendarWatchService,
  type GoogleCalendarWatchChannel,
  type GoogleCalendarWatchChannelRegistration,
  type GoogleCalendarWatchProvider,
  type GoogleCalendarWatchStore,
} from './google-calendar-watch.js';

const NOW = new Date('2026-09-13T07:00:00.000Z');
const WEBHOOK_ADDRESS = 'https://example.test/v1/calendars/google/webhook';

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function channel(overrides: Partial<GoogleCalendarWatchChannel> = {}): GoogleCalendarWatchChannel {
  return {
    connectionId: '11111111-1111-4111-8111-111111111111',
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
  const scheduledSignals = new Set<string>();
  const scheduledWork: string[] = [];
  const savedChannels: Array<{
    connectionId: string;
    channel: GoogleCalendarWatchChannelRegistration;
  }> = [];
  const renewedChannels: Array<{
    previousChannelId: string;
    replacement: GoogleCalendarWatchChannelRegistration;
  }> = [];

  const store: GoogleCalendarWatchStore = {
    getChannel: vi.fn(async () => input.storedChannel ?? channel()),
    schedulePullOnce: vi.fn(async ({ connectionId, channelId, messageNumber }) => {
      const key = `${channelId}:${messageNumber}`;
      if (scheduledSignals.has(key)) return false;
      scheduledSignals.add(key);
      scheduledWork.push(connectionId);
      return true;
    }),
    hasCurrentChannel: vi.fn(async () => input.hasCurrentChannel ?? false),
    saveChannel: vi.fn(async (connectionId, registration) => {
      savedChannels.push({ connectionId, channel: registration });
    }),
    listChannelsDueForRenewal: vi.fn(async () => input.dueChannels ?? []),
    markRenewed: vi.fn(async (previousChannelId, replacement) => {
      renewedChannels.push({ previousChannelId, replacement });
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

describe('MTS-071 Google Calendar watch notifications', () => {
  it('treats the webhook body as opaque and schedules work from verified headers only', async () => {
    const { service, store, scheduledWork } = createHarness();

    await expect(
      service.handleWebhook({
        channelId: 'channel-old',
        resourceId: 'resource-1',
        channelToken: 'secret-token',
        messageNumber: '42',
        resourceState: 'exists',
        body: { fabricated: ['event', 'payload'], shouldNeverBeParsed: true },
      }),
    ).resolves.toEqual({ accepted: true, scheduled: true });

    expect(store.schedulePullOnce).toHaveBeenCalledWith({
      connectionId: '11111111-1111-4111-8111-111111111111',
      channelId: 'channel-old',
      messageNumber: '42',
      resourceState: 'exists',
    });
    expect(scheduledWork).toEqual(['11111111-1111-4111-8111-111111111111']);
  });

  it('does not duplicate pull work when Google retries the same channel message', async () => {
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
    await expect(
      service.handleWebhook({ ...message, body: 'different opaque body' }),
    ).resolves.toEqual({ accepted: true, scheduled: false });

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
  ])('fails safely for %s without scheduling pull work', async (_label, stored, resourceId, token) => {
    const { service, store, scheduledWork } = createHarness({ storedChannel: stored });

    await expect(
      service.handleWebhook({
        channelId: 'channel-old',
        resourceId,
        channelToken: token,
        messageNumber: '44',
        resourceState: 'exists',
        body: { ignored: true },
      }),
    ).resolves.toEqual({ accepted: false, scheduled: false });

    expect(store.schedulePullOnce).not.toHaveBeenCalled();
    expect(scheduledWork).toEqual([]);
  });
});

describe('MTS-071 Google Calendar watch lifecycle', () => {
  it('creates one current channel with a hashed verification token', async () => {
    const { service, provider, savedChannels } = createHarness();

    await service.ensureChannel('11111111-1111-4111-8111-111111111111');

    expect(provider.watchEvents).toHaveBeenCalledWith({
      connectionId: '11111111-1111-4111-8111-111111111111',
      channelId: 'channel-new',
      channelToken: 'new-secret-token',
      webhookAddress: WEBHOOK_ADDRESS,
    });
    expect(savedChannels).toEqual([
      {
        connectionId: '11111111-1111-4111-8111-111111111111',
        channel: {
          channelId: 'channel-new',
          resourceId: 'resource-for-channel-new',
          tokenHash: tokenHash('new-secret-token'),
          expiresAt: new Date('2026-09-20T07:00:00.000Z'),
        },
      },
    ]);
  });

  it('does not create a duplicate current channel', async () => {
    const { service, provider } = createHarness({ hasCurrentChannel: true });

    await service.ensureChannel('11111111-1111-4111-8111-111111111111');

    expect(provider.watchEvents).not.toHaveBeenCalled();
  });

  it('renews channels inside the pre-expiry window using bounded work', async () => {
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
        previousChannelId: 'channel-old',
        replacement: {
          channelId: 'channel-new',
          resourceId: 'resource-for-channel-new',
          tokenHash: tokenHash('new-secret-token'),
          expiresAt: new Date('2026-09-20T07:00:00.000Z'),
        },
      },
    ]);
  });

  it('rejects an unbounded renewal batch size', async () => {
    const { service } = createHarness();

    await expect(service.renewDueChannels(0)).rejects.toThrow('google_calendar_watch_limit_invalid');
    await expect(service.renewDueChannels(501)).rejects.toThrow('google_calendar_watch_limit_invalid');
  });
});
