import {
  accountSettingsSchema,
  accountSettingsUpdateSchema,
  deviceRegistrationRequestSchema,
  deviceRegistrationResponseSchema,
  syncPullResponseSchema,
  syncPushRequestSchema,
  syncPushResponseSchema,
  syncSnapshotResponseSchema,
  type AccountSettings,
  type AccountSettingsUpdate,
  type DeviceRegistrationRequest,
  type DeviceRegistrationResponse,
  type SyncConflictOutcomeContract,
  type SyncMutationContract,
  type SyncPullResponseContract,
  type SyncSnapshotResponseContract,
} from '@misyra/contracts';

type SyncPushResponse = Readonly<{
  acceptedMutationIds: string[];
  conflicts: SyncConflictOutcomeContract[];
}>;

export type AuthenticatedSyncApi = Readonly<{
  registerDevice(input: DeviceRegistrationRequest): Promise<DeviceRegistrationResponse>;
  getAccountSettings(): Promise<AccountSettings>;
  updateAccountSettings(input: AccountSettingsUpdate): Promise<AccountSettings>;
  push(mutations: readonly SyncMutationContract[]): Promise<SyncPushResponse>;
  pull(input: Readonly<{ cursor: number; limit: number }>): Promise<SyncPullResponseContract>;
  snapshot(): Promise<SyncSnapshotResponseContract>;
}>;

type FetchResponse = Readonly<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

type FetchInit = Readonly<{
  method: 'GET' | 'POST' | 'PATCH';
  headers: Readonly<{
    authorization: string;
    'content-type'?: string;
  }>;
  body?: string;
}>;

type Fetcher = (url: string, init: FetchInit) => Promise<FetchResponse>;

type AuthenticatedSyncApiOptions = Readonly<{
  baseUrl: string;
  accessToken: string;
  fetcher?: Fetcher;
}>;

function normalizedBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function payloadFromEnvelope(value: unknown): unknown {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).ok !== true ||
    !Object.hasOwn(value, 'payload')
  ) {
    throw new Error('sync_request_failed');
  }
  return (value as Record<string, unknown>).payload;
}

export function createAuthenticatedSyncApi({
  baseUrl,
  accessToken,
  fetcher = fetch,
}: AuthenticatedSyncApiOptions): AuthenticatedSyncApi {
  if (accessToken.length === 0) throw new TypeError('Access token must not be empty.');
  const root = normalizedBaseUrl(baseUrl);

  async function request(
    path: string,
    method: FetchInit['method'],
    body?: unknown,
  ): Promise<unknown> {
    const hasBody = body !== undefined;
    const response = await fetcher(`${root}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
    });
    const responseBody = await response.json();
    if (!response.ok) throw new Error('sync_request_failed');
    return payloadFromEnvelope(responseBody);
  }

  return {
    async registerDevice(input) {
      const registration = deviceRegistrationRequestSchema.parse(input);
      return deviceRegistrationResponseSchema.parse(
        await request('/v1/devices/register', 'POST', registration),
      );
    },

    async getAccountSettings() {
      return accountSettingsSchema.parse(await request('/v1/account/settings', 'GET'));
    },

    async updateAccountSettings(input) {
      const settings = accountSettingsUpdateSchema.parse(input);
      return accountSettingsSchema.parse(await request('/v1/account/settings', 'PATCH', settings));
    },

    async push(mutations) {
      const requestBody = syncPushRequestSchema.parse({ mutations });
      return syncPushResponseSchema.parse(await request('/v1/sync/push', 'POST', requestBody));
    },

    async pull(input) {
      const query = new URLSearchParams({
        cursor: String(input.cursor),
        limit: String(input.limit),
      });
      return syncPullResponseSchema.parse(
        await request(`/v1/sync/pull?${query.toString()}`, 'GET'),
      );
    },

    async snapshot() {
      return syncSnapshotResponseSchema.parse(await request('/v1/sync/snapshot', 'GET'));
    },
  };
}
