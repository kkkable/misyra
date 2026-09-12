import { describe, expect, it, vi } from 'vitest';

import {
  createGoogleCalendarConnectionService,
  GoogleCalendarOAuthError,
} from './google-calendar-connection.js';

const accountId = '00000000-0000-4000-8000-000000000069';
const connectionId = '00000000-0000-4000-8000-000000000169';
const now = new Date('2026-09-12T13:40:00.000Z');

function createHarness() {
  const states = new Map();
  const connections = new Map();
  const store = {
    saveOAuthState: vi.fn(async (record) => {
      states.set(record.stateHash, record);
    }),
    consumeOAuthState: vi.fn(async (stateHash, currentTime) => {
      const record = states.get(stateHash);
      if (!record || record.consumedAt || record.expiresAt.getTime() <= currentTime.getTime()) {
        return null;
      }
      record.consumedAt = currentTime;
      return record;
    }),
    createConnection: vi.fn(async (record) => {
      if ([...connections.values()].some((item) => item.accountId === record.accountId)) {
        throw new Error('connection_exists');
      }
      const saved = { ...record, id: connectionId };
      connections.set(connectionId, saved);
      return saved;
    }),
    disconnectConnection: vi.fn(async (requestedAccountId, requestedConnectionId) => {
      const record = connections.get(requestedConnectionId);
      if (!record || record.accountId !== requestedAccountId || record.state === 'disconnected') {
        return null;
      }
      record.state = 'disconnected';
      return {
        id: record.id,
        encryptedRefreshToken: record.encryptedRefreshToken,
      };
    }),
  };
  const provider = {
    buildAuthorizationUrl: vi.fn(({ state }) => `https://accounts.google.test/oauth?state=${state}`),
    exchangeCode: vi.fn(async () => ({ refreshToken: 'google-refresh-secret' })),
    createDedicatedCalendar: vi.fn(async () => 'misyra-calendar-id'),
    revokeRefreshToken: vi.fn(async () => undefined),
  };
  const cipher = {
    encrypt: vi.fn(async (plaintext) => `encrypted:${plaintext.length}`),
    decrypt: vi.fn(async () => 'google-refresh-secret'),
  };
  const service = createGoogleCalendarConnectionService({
    store,
    provider,
    cipher,
    now: () => now,
    stateFactory: () => 'opaque-oauth-state-value',
    stateTtlMs: 10 * 60 * 1000,
  });

  return { cipher, connections, provider, service, states, store };
}

describe('MTS-069 Google OAuth and connection storage', () => {
  it('creates a bounded OAuth state without persisting the raw state value', async () => {
    const { provider, service, states, store } = createHarness();

    const result = await service.startOAuth(accountId, {
      initialSyncDirection: 'external_to_misyra',
      selectedCalendarId: 'primary',
    });

    expect(result.authorizationUrl).toContain('opaque-oauth-state-value');
    expect(provider.buildAuthorizationUrl).toHaveBeenCalledWith({
      state: 'opaque-oauth-state-value',
    });
    expect(store.saveOAuthState).toHaveBeenCalledOnce();
    const saved = store.saveOAuthState.mock.calls[0][0];
    expect(saved.accountId).toBe(accountId);
    expect(saved.stateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(saved.stateHash).not.toContain('opaque-oauth-state-value');
    expect(saved.expiresAt.toISOString()).toBe('2026-09-12T13:50:00.000Z');
    expect(saved.initialSyncDirection).toBe('external_to_misyra');
    expect(saved.selectedCalendarId).toBe('primary');
    expect(JSON.stringify([...states.values()])).not.toContain('opaque-oauth-state-value');
  });

  it('consumes OAuth state exactly once and stores only an encrypted refresh token', async () => {
    const { cipher, provider, service, store } = createHarness();
    await service.startOAuth(accountId, {
      initialSyncDirection: 'external_to_misyra',
      selectedCalendarId: 'primary',
    });

    const connection = await service.completeOAuth({
      state: 'opaque-oauth-state-value',
      code: 'authorization-code',
    });

    expect(provider.exchangeCode).toHaveBeenCalledWith('authorization-code');
    expect(cipher.encrypt).toHaveBeenCalledWith('google-refresh-secret');
    expect(store.createConnection).toHaveBeenCalledWith({
      accountId,
      provider: 'google',
      providerCalendarId: 'primary',
      initialSyncDirection: 'external_to_misyra',
      encryptedRefreshToken: 'encrypted:21',
      state: 'connected',
    });
    expect(JSON.stringify(store.createConnection.mock.calls[0][0])).not.toContain(
      'google-refresh-secret',
    );
    expect(connection).toMatchObject({
      id: connectionId,
      provider: 'google',
      providerCalendarId: 'primary',
      initialSyncDirection: 'external_to_misyra',
      state: 'connected',
    });
    await expect(
      service.completeOAuth({ state: 'opaque-oauth-state-value', code: 'replay-code' }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
    expect(provider.exchangeCode).toHaveBeenCalledOnce();
  });

  it('rejects an expired OAuth state before exchanging a provider code', async () => {
    const harness = createHarness();
    await harness.service.startOAuth(accountId, {
      initialSyncDirection: 'external_to_misyra',
      selectedCalendarId: 'primary',
    });
    const stored = harness.states.values().next().value;
    stored.expiresAt = new Date('2026-09-12T13:39:59.999Z');

    await expect(
      harness.service.completeOAuth({ state: 'opaque-oauth-state-value', code: 'expired-code' }),
    ).rejects.toEqual(expect.objectContaining({ code: 'invalid_state' }));
    expect(harness.provider.exchangeCode).not.toHaveBeenCalled();
  });

  it('creates and stores a dedicated Google calendar when Misyra is the initial source', async () => {
    const { provider, service, store } = createHarness();
    await service.startOAuth(accountId, {
      initialSyncDirection: 'misyra_to_external',
    });

    const connection = await service.completeOAuth({
      state: 'opaque-oauth-state-value',
      code: 'authorization-code',
    });

    expect(provider.createDedicatedCalendar).toHaveBeenCalledWith('google-refresh-secret');
    expect(store.createConnection.mock.calls[0][0].providerCalendarId).toBe('misyra-calendar-id');
    expect(connection.providerCalendarId).toBe('misyra-calendar-id');
  });

  it('marks a connection disconnected before revoking provider access', async () => {
    const { cipher, connections, provider, service, store } = createHarness();
    await service.startOAuth(accountId, {
      initialSyncDirection: 'external_to_misyra',
      selectedCalendarId: 'primary',
    });
    await service.completeOAuth({ state: 'opaque-oauth-state-value', code: 'authorization-code' });

    const callOrder = [];
    store.disconnectConnection.mockImplementation(async (requestedAccountId, requestedConnectionId) => {
      callOrder.push('disconnect');
      const record = connections.get(requestedConnectionId);
      if (!record || record.accountId !== requestedAccountId) return null;
      record.state = 'disconnected';
      return { id: record.id, encryptedRefreshToken: record.encryptedRefreshToken };
    });
    provider.revokeRefreshToken.mockImplementation(async () => {
      callOrder.push('revoke');
    });

    await service.disconnect(accountId, connectionId);

    expect(callOrder).toEqual(['disconnect', 'revoke']);
    expect(connections.get(connectionId).state).toBe('disconnected');
    expect(cipher.decrypt).toHaveBeenCalledWith('encrypted:21');
    expect(provider.revokeRefreshToken).toHaveBeenCalledWith('google-refresh-secret');
  });

  it('never exposes a refresh token in provider-facing failure messages', async () => {
    const { provider, service } = createHarness();
    await service.startOAuth(accountId, {
      initialSyncDirection: 'external_to_misyra',
      selectedCalendarId: 'primary',
    });
    provider.exchangeCode.mockRejectedValueOnce(
      new Error('provider failed with google-refresh-secret in diagnostic text'),
    );

    let error;
    try {
      await service.completeOAuth({ state: 'opaque-oauth-state-value', code: 'bad-code' });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(GoogleCalendarOAuthError);
    expect(error).toMatchObject({ code: 'provider_error' });
    expect(String(error)).not.toContain('google-refresh-secret');
  });
});
