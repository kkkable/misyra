import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const DEFAULT_RENEWAL_LEAD_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_RENEWAL_BATCH_LIMIT = 100;
const MAX_RENEWAL_BATCH_LIMIT = 500;
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;
const MESSAGE_NUMBER_PATTERN = /^\d+$/;

export type GoogleCalendarWatchChannel = Readonly<{
  connectionId: string;
  channelId: string;
  resourceId: string;
  tokenHash: string;
  expiresAt: Date;
}>;

export type GoogleCalendarWatchMessage = Readonly<{
  channelId: string;
  resourceId: string;
  channelToken: string;
  messageNumber: string;
  resourceState: string;
  body?: unknown;
}>;

export type GoogleCalendarWatchRegistration = Readonly<{
  channelId: string;
  resourceId: string;
  tokenHash: string;
  expiresAt: Date;
}>;

export type GoogleCalendarPullSignal = Readonly<{
  connectionId: string;
  channelId: string;
  messageNumber: string;
  resourceState: string;
}>;

export type GoogleCalendarRenewalQuery = Readonly<{
  before: Date;
  limit: number;
}>;

export type GoogleCalendarSaveChannel = Readonly<{
  connectionId: string;
  channel: GoogleCalendarWatchRegistration;
}>;

export type GoogleCalendarRenewedChannel = Readonly<{
  previousChannelId: string;
  replacement: GoogleCalendarWatchRegistration;
}>;

export type GoogleCalendarWatchRequest = Readonly<{
  connectionId: string;
  channelId: string;
  channelToken: string;
  webhookAddress: string;
}>;

export type GoogleCalendarWatchResponse = Readonly<{
  resourceId: string;
  expiresAt: Date;
}>;

export type GoogleCalendarWatchResult = Readonly<{
  accepted: boolean;
  scheduled: boolean;
}>;

export interface GoogleCalendarWatchStore {
  getChannel(channelId: string): Promise<GoogleCalendarWatchChannel | null>;
  schedulePullOnce(input: GoogleCalendarPullSignal): Promise<boolean>;
  hasCurrentChannel(connectionId: string): Promise<boolean>;
  saveChannel(input: GoogleCalendarSaveChannel): Promise<void>;
  listChannelsDueForRenewal(
    input: GoogleCalendarRenewalQuery,
  ): Promise<readonly GoogleCalendarWatchChannel[]>;
  markRenewed(input: GoogleCalendarRenewedChannel): Promise<void>;
}

export interface GoogleCalendarWatchProvider {
  watchEvents(input: GoogleCalendarWatchRequest): Promise<GoogleCalendarWatchResponse>;
}

export interface GoogleCalendarWatchService {
  handleWebhook(message: GoogleCalendarWatchMessage): Promise<GoogleCalendarWatchResult>;
  ensureChannel(connectionId: string): Promise<void>;
  renewDueChannels(limit?: number): Promise<number>;
}

export type GoogleCalendarWatchDependencies = Readonly<{
  store: GoogleCalendarWatchStore;
  provider: GoogleCalendarWatchProvider;
  webhookAddress: string;
  now?: () => Date;
  createChannelId?: () => string;
  createChannelToken?: () => string;
  renewalLeadMs?: number;
}>;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenMatches(channelToken: string, storedHash: string): boolean {
  if (!TOKEN_HASH_PATTERN.test(storedHash)) return false;
  const candidate = Buffer.from(hashToken(channelToken), 'ascii');
  const stored = Buffer.from(storedHash, 'ascii');
  return timingSafeEqual(candidate, stored);
}

function isValidWebhookMessage(message: GoogleCalendarWatchMessage): boolean {
  return (
    message.channelId.length > 0 &&
    message.resourceId.length > 0 &&
    message.channelToken.length > 0 &&
    MESSAGE_NUMBER_PATTERN.test(message.messageNumber) &&
    message.resourceState.length > 0
  );
}

function registrationFromProvider(
  channelId: string,
  channelToken: string,
  response: GoogleCalendarWatchResponse,
  now: Date,
): GoogleCalendarWatchRegistration {
  if (
    response.resourceId.length === 0 ||
    Number.isNaN(response.expiresAt.getTime()) ||
    response.expiresAt.getTime() <= now.getTime()
  ) {
    throw new Error('google_calendar_watch_provider_response_invalid');
  }
  return {
    channelId,
    resourceId: response.resourceId,
    tokenHash: hashToken(channelToken),
    expiresAt: response.expiresAt,
  };
}

export function createGoogleCalendarWatchService(
  dependencies: GoogleCalendarWatchDependencies,
): GoogleCalendarWatchService {
  const now = dependencies.now ?? (() => new Date());
  const createChannelId = dependencies.createChannelId ?? randomUUID;
  const createChannelToken =
    dependencies.createChannelToken ?? (() => randomBytes(32).toString('base64url'));
  const renewalLeadMs = dependencies.renewalLeadMs ?? DEFAULT_RENEWAL_LEAD_MS;

  async function createRegistration(connectionId: string) {
    const channelId = createChannelId();
    const channelToken = createChannelToken();
    const observedNow = now();
    const response = await dependencies.provider.watchEvents({
      connectionId,
      channelId,
      channelToken,
      webhookAddress: dependencies.webhookAddress,
    });
    return registrationFromProvider(channelId, channelToken, response, observedNow);
  }

  async function handleWebhook(
    message: GoogleCalendarWatchMessage,
  ): Promise<GoogleCalendarWatchResult> {
    if (!isValidWebhookMessage(message)) return { accepted: false, scheduled: false };

    const channel = await dependencies.store.getChannel(message.channelId);
    if (
      channel === null ||
      channel.resourceId !== message.resourceId ||
      channel.expiresAt.getTime() <= now().getTime() ||
      !tokenMatches(message.channelToken, channel.tokenHash)
    ) {
      return { accepted: false, scheduled: false };
    }

    const scheduled = await dependencies.store.schedulePullOnce({
      connectionId: channel.connectionId,
      channelId: message.channelId,
      messageNumber: message.messageNumber,
      resourceState: message.resourceState,
    });
    return { accepted: true, scheduled };
  }

  async function ensureChannel(connectionId: string): Promise<void> {
    if (await dependencies.store.hasCurrentChannel(connectionId)) return;
    const channel = await createRegistration(connectionId);
    await dependencies.store.saveChannel({ connectionId, channel });
  }

  async function renewDueChannels(limit = DEFAULT_RENEWAL_BATCH_LIMIT): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RENEWAL_BATCH_LIMIT) {
      throw new Error('google_calendar_watch_limit_invalid');
    }
    if (!Number.isFinite(renewalLeadMs) || renewalLeadMs < 0) {
      throw new Error('google_calendar_watch_renewal_lead_invalid');
    }

    const observedNow = now();
    const before = new Date(observedNow.getTime() + renewalLeadMs);
    let renewed = 0;

    while (renewed < limit) {
      const [current] = await dependencies.store.listChannelsDueForRenewal({ before, limit: 1 });
      if (current === undefined) break;

      const replacement = await createRegistration(current.connectionId);
      await dependencies.store.markRenewed({
        previousChannelId: current.channelId,
        replacement,
      });
      renewed += 1;
    }
    return renewed;
  }

  return Object.freeze({ handleWebhook, ensureChannel, renewDueChannels });
}
