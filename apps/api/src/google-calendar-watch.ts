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

export function createGoogleCalendarWatchService(
  _dependencies: GoogleCalendarWatchDependencies,
): GoogleCalendarWatchService {
  const fail = () => Promise.reject(new Error('google_calendar_watch_not_implemented'));
  return Object.freeze({
    handleWebhook: fail,
    ensureChannel: fail,
    renewDueChannels: fail,
  });
}
