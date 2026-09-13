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

export type GoogleCalendarWatchSchedulePullInput = Readonly<{
  connectionId: string;
  channelId: string;
  messageNumber: string;
  resourceState: string;
}>;

export type GoogleCalendarWatchRenewalQuery = Readonly<{
  before: Date;
  limit: number;
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

export type GoogleCalendarWatchWebhookResult = Readonly<{
  accepted: boolean;
  scheduled: boolean;
}>;

export interface GoogleCalendarWatchStore {
  getChannel(channelId: string): Promise<GoogleCalendarWatchChannel | null>;
  schedulePullOnce(input: GoogleCalendarWatchSchedulePullInput): Promise<boolean>;
  hasCurrentChannel(connectionId: string): Promise<boolean>;
  saveChannel(
    connectionId: string,
    channel: GoogleCalendarWatchChannelRegistration,
  ): Promise<void>;
  listChannelsDueForRenewal(
    input: GoogleCalendarWatchRenewalQuery,
  ): Promise<readonly GoogleCalendarWatchChannel[]>;
  markRenewed(
    previousChannelId: string,
    replacement: GoogleCalendarWatchChannelRegistration,
  ): Promise<void>;
}

export interface GoogleCalendarWatchProvider {
  watchEvents(input: GoogleCalendarWatchRequest): Promise<GoogleCalendarWatchResponse>;
}

export interface GoogleCalendarWatchService {
  handleWebhook(message: GoogleCalendarWatchMessage): Promise<GoogleCalendarWatchWebhookResult>;
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
  const notImplemented = () =>
    Promise.reject(new Error('google_calendar_watch_not_implemented'));
  return Object.freeze({
    handleWebhook: notImplemented,
    ensureChannel: notImplemented,
    renewDueChannels: notImplemented,
  });
}
