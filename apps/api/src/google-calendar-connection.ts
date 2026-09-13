import { createHash, randomBytes } from 'node:crypto';

import type { ExternalCalendarInitialSyncDirection } from '@misyra/contracts';

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;

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
  findRevocableConnectionId(accountId: string): Promise<string | null>;
  disconnectConnection(
    accountId: string,
    connectionId: string,
  ): Promise<Pick<GoogleCalendarConnectionRecord, 'id' | 'encryptedRefreshToken'> | null>;
  clearDisconnectedRefreshToken(accountId: string, connectionId: string): Promise<void>;
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
  'invalid_state' | 'connection_exists' | 'not_found' | 'provider_error';

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
  completeOAuth(
    input: Readonly<{ state: string; code: string }>,
  ): Promise<GoogleCalendarConnectionRecord>;
  disconnect(accountId: string, connectionId: string): Promise<void>;
  disconnectAccount(accountId: string): Promise<void>;
}>;

function hashOAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

function createDefaultState(): string {
  return randomBytes(32).toString('base64url');
}

function providerError(): GoogleCalendarOAuthError {
  return new GoogleCalendarOAuthError('provider_error');
}

function isConnectionExistsError(error: unknown): boolean {
  return error instanceof Error && error.message === 'connection_exists';
}

export function createGoogleCalendarConnectionService(input: {
  store: GoogleCalendarConnectionStore;
  provider: GoogleCalendarOAuthGateway;
  cipher: GoogleCalendarTokenCipher;
  now?: () => Date;
  stateFactory?: () => string;
  stateTtlMs?: number;
}): GoogleCalendarConnectionService {
  const now = input.now ?? (() => new Date());
  const stateFactory = input.stateFactory ?? createDefaultState;
  const stateTtlMs = input.stateTtlMs ?? DEFAULT_STATE_TTL_MS;

  if (!Number.isFinite(stateTtlMs) || stateTtlMs <= 0) {
    throw new TypeError('stateTtlMs must be a positive finite number');
  }

  const revokeProviderGrantBestEffort = async (refreshToken: string) => {
    try {
      await input.provider.revokeRefreshToken(refreshToken);
    } catch {
      // The original OAuth completion failure remains authoritative. Never expose provider details.
    }
  };

  const disconnectConnection = async (accountId: string, connectionId: string) => {
    const connection = await input.store.disconnectConnection(accountId, connectionId);
    if (!connection) {
      throw new GoogleCalendarOAuthError('not_found');
    }

    try {
      const refreshToken = await input.cipher.decrypt(connection.encryptedRefreshToken);
      await input.provider.revokeRefreshToken(refreshToken);
      await input.store.clearDisconnectedRefreshToken(accountId, connectionId);
    } catch {
      throw providerError();
    }
  };

  return {
    async startOAuth(accountId, request) {
      const state = stateFactory();
      const currentTime = now();
      try {
        await input.store.saveOAuthState({
          accountId,
          stateHash: hashOAuthState(state),
          expiresAt: new Date(currentTime.getTime() + stateTtlMs),
          consumedAt: null,
          initialSyncDirection: request.initialSyncDirection,
          selectedCalendarId: request.selectedCalendarId ?? null,
        });
      } catch (error) {
        if (isConnectionExistsError(error)) {
          throw new GoogleCalendarOAuthError('connection_exists');
        }
        throw providerError();
      }

      return {
        authorizationUrl: input.provider.buildAuthorizationUrl({ state }),
      };
    },

    async completeOAuth(request) {
      const state = await input.store.consumeOAuthState(hashOAuthState(request.state), now());
      if (!state) {
        throw new GoogleCalendarOAuthError('invalid_state');
      }

      let refreshToken: string;
      try {
        ({ refreshToken } = await input.provider.exchangeCode(request.code));
      } catch {
        throw providerError();
      }

      let providerCalendarId: string;
      if (state.initialSyncDirection === 'misyra_to_external') {
        try {
          providerCalendarId = await input.provider.createDedicatedCalendar(refreshToken);
        } catch {
          await revokeProviderGrantBestEffort(refreshToken);
          throw providerError();
        }
      } else if (state.selectedCalendarId) {
        providerCalendarId = state.selectedCalendarId;
      } else {
        await revokeProviderGrantBestEffort(refreshToken);
        throw new GoogleCalendarOAuthError('invalid_state');
      }

      let encryptedRefreshToken: string;
      try {
        encryptedRefreshToken = await input.cipher.encrypt(refreshToken);
      } catch {
        await revokeProviderGrantBestEffort(refreshToken);
        throw providerError();
      }

      try {
        return await input.store.createConnection({
          accountId: state.accountId,
          provider: 'google',
          providerCalendarId,
          initialSyncDirection: state.initialSyncDirection,
          encryptedRefreshToken,
          state: 'connected',
        });
      } catch (error) {
        await revokeProviderGrantBestEffort(refreshToken);
        if (isConnectionExistsError(error)) {
          throw new GoogleCalendarOAuthError('connection_exists');
        }
        throw providerError();
      }
    },

    disconnect: disconnectConnection,

    async disconnectAccount(accountId) {
      let connectionId: string | null;
      try {
        connectionId = await input.store.findRevocableConnectionId(accountId);
      } catch {
        throw providerError();
      }
      if (!connectionId) return;

      try {
        await disconnectConnection(accountId, connectionId);
      } catch (error) {
        if (error instanceof GoogleCalendarOAuthError && error.code === 'not_found') {
          return;
        }
        throw error;
      }
    },
  };
}
