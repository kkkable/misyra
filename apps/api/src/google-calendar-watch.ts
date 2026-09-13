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

export type GoogleCalendarWatchChannelRegistration = Readonly<{
  channelId: string;
  resourceId: string;
  tokenHash: string;
  expiresAt: Date;
}>;

export interface GoogleCalendarWatchStore {
  getChannel(channelId: string): Promise<GoogleCalendarWatchChannel | null>;
  schedulePullOnce(input: Readonly<{
    connectionId: string;
    channelId: string;
    messageNumber: string;
    resourceState: string;
  }>): Promise<boolean>;
  hasCurrentChannel(connectionId: string): Promise<boolean>;
  saveChannel(
    connectionId: string,
    channel: GoogleCalendarWatchChannelRegistration,
  ): Promise<void>;
  listChannelsDueForRenewal(input: Readonly<{
    before: Date;
    limit: number;
  }>): Promise<readonly GoogleCalendarWatchChannel[]>;
  markRenewed(
    previousChannelId: string,
    replacement: GoogleCalendarWatchChannelRegistration,
  ): Promise<void>;
}

export interface GoogleCalendarWatchProvider {
  watchEvents(input: Readonly<{
    connectionId: string;
    channelId: string;
    channelToken: string;
    webhookAddress: string;
  }>): Promise<Readonly<{
    resourceId: string;
    expiresAt: Date;
  }>>;
}

export interface GoogleCalendarWatchService {
  handleWebhook(message: GoogleCalendarWatchMessage): Promise<
    Readonly<{
      accepted: boolean;
      scheduled: boolean;
    }>
  >;
  ensureChannel(connectionId: string): Promise<void>;
  renewDueChannels(limit?: number): Promise<number>;
}

export type GoogleCalendarWatchServiceDependencies = Readonly<{
  store: GoogleCalendarWatchStore;
  provider: GoogleCalendarWatchProvider;
  webhookAddress: string;
  now?: () => Date;
  createChannelId?: () => string;
  createChannelToken?: () => string;
  renewalLeadMs?: number;
}>;

export function createGoogleCalendarWatchService(
  _dependencies: GoogleCalendarWatchServiceDependencies,
): GoogleCalendarWatchService {
  const notImplemented = () => Promise.reject(new Error('google_calendar_watch_not_implemented'));
  return Object.freeze({
    handleWebhook: notImplemented,
    ensureChannel: notImplemented,
    renewDueChannels: notImplemented,
  });
}
