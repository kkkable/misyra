import type { ExternalCalendarInitialSyncDirection } from '@misyra/contracts';

export type GoogleCalendarOAuthStateRecord = Readonly<{
  accountId: string;
  stateHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  initialSyncDirection: ExternalCalendarInitialSyncDirection;
  selectedCalendarId: string | null;
}>;

export type GoogleCalendarConnectionRecord = Readonly<{
  id: string;
  accountId: string;
  provider: 'google';
  providerCalendarId: string;
  initialSyncDirection: ExternalCalendarInitialSyncDirection;
  encryptedRefreshToken: string;
  state: 'connected' | 'disconnected';
}>;

export type GoogleCalendarConnectionStore = Readonly<{
  saveOAuthState(record: GoogleCalendarOAuthStateRecord): Promise<void>;
  consumeOAuthState(
    stateHash: string,
    currentTime: Date,
  ): Promise<GoogleCalendarOAuthStateRecord | null>;
  createConnection(
    record: Omit<GoogleCalendarConnectionRecord, 'id'>,
  ): Promise<GoogleCalendarConnectionRecord>;
  disconnectConnection(
    accountId: string,
    connectionId: string,
  ): Promise<Pick<GoogleCalendarConnectionRecord, 'id' | 'encryptedRefreshToken'> | null>;
}>;

export type GoogleCalendarOAuthGateway = Readonly<{
  buildAuthorizationUrl(input: { state: string }): string;
  exchangeCode(code: string): Promise<{ refreshToken: string }>;
  createDedicatedCalendar(refreshToken: string): Promise<string>;
  revokeRefreshToken(refreshToken: string): Promise<void>;
}>;

export type GoogleCalendarTokenCipher = Readonly<{
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}>;

export type GoogleCalendarOAuthErrorCode =
  | 'invalid_state'
  | 'connection_exists'
  | 'not_found'
  | 'provider_error';

export class GoogleCalendarOAuthError extends Error {
  readonly code: GoogleCalendarOAuthErrorCode;

  constructor(code: GoogleCalendarOAuthErrorCode) {
    super(code);
    this.name = 'GoogleCalendarOAuthError';
    this.code = code;
  }
}

export type GoogleCalendarConnectionService = Readonly<{
  startOAuth(
    accountId: string,
    input: Readonly<{
      initialSyncDirection: ExternalCalendarInitialSyncDirection;
      selectedCalendarId?: string;
    }>,
  ): Promise<{ authorizationUrl: string }>;
  completeOAuth(input: Readonly<{ state: string; code: string }>): Promise<GoogleCalendarConnectionRecord>;
  disconnect(accountId: string, connectionId: string): Promise<void>;
}>;

export function createGoogleCalendarConnectionService(input: {
  store: GoogleCalendarConnectionStore;
  provider: GoogleCalendarOAuthGateway;
  cipher: GoogleCalendarTokenCipher;
  now?: () => Date;
  stateFactory?: () => string;
  stateTtlMs?: number;
}): GoogleCalendarConnectionService {
  void input;
  return {
    startOAuth(accountId, request) {
      void accountId;
      void request;
      return Promise.reject(new Error('MTS-069 not implemented'));
    },
    completeOAuth(request) {
      void request;
      return Promise.reject(new Error('MTS-069 not implemented'));
    },
    disconnect(accountId, connectionId) {
      void accountId;
      void connectionId;
      return Promise.reject(new Error('MTS-069 not implemented'));
    },
  };
}
