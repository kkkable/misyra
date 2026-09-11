import {
  accountSettingsSchema,
  accountSettingsUpdateSchema,
  completeMissionRequestSchema,
  completeMissionResultSchema,
  deviceRegistrationRequestSchema,
  deviceRegistrationResponseSchema,
  syncPullResponseSchema,
  syncPushRequestSchema,
  syncPushResponseSchema,
  syncSnapshotResponseSchema,
  uuidSchema,
  type AccountSettings,
  type AccountSettingsUpdate,
  type CompleteMissionRequest,
  type CompleteMissionResult,
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
  completeMission(
    occurrenceId: string,
    input: CompleteMissionRequest,
  ): Promise<CompleteMissionResult>;
  push(mutations: readonly SyncMutationContract[]): Promise<SyncPushResponse>;
  pull(input: Readonly<{ cursor: number; limit: number }>): Promise<SyncPullResponseContract>;
  snapshot(): Promise<SyncSnapshotResponseContract>;
}>;

type CompletionPushApi = Pick<AuthenticatedSyncApi, 'completeMission' | 'push'>;

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

function completionRequestFromMutation(mutation: SyncMutationContract): CompleteMissionRequest | null {
  if (mutation.entityType !== 'completion' || mutation.operation !== 'complete') return null;
  const occurrenceId = uuidSchema.safeParse(mutation.entityId);
  const request = completeMissionRequestSchema.safeParse(mutation.payload);
  if (!occurrenceId.success || !request.success) throw new Error('completion_mutation_invalid');
  if (request.data.completionMode !== 'private' && request.data.completionMode !== 'trust') {
    throw new Error('completion_mutation_invalid');
  }
  if (
    request.data.deviceId !== mutation.deviceId ||
    request.data.idempotencyKey !== mutation.mutationId ||
    request.data.effectiveActionAt !== mutation.clientOccurredAt
  ) {
    throw new Error('completion_mutation_invalid');
  }
  return request.data;
}

export async function pushQueuedMutationsWithCompletions(
  api: CompletionPushApi,
  mutations: readonly SyncMutationContract[],
): Promise<SyncPushResponse> {
  const acceptedMutationIds: string[] = [];
  const conflicts: SyncConflictOutcomeContract[] = [];

  for (const mutation of mutations) {
    const completion = completionRequestFromMutation(mutation);
    if (completion !== null) {
      const result = await api.completeMission(mutation.entityId, completion);
      if (result.status === 'completed') {
        acceptedMutationIds.push(mutation.mutationId);
        continue;
      }
      conflicts.push({
        kind: 'mission_completed_elsewhere',
        mutationId: mutation.mutationId,
        missionId: mutation.entityId,
      });
      break;
    }

    const result = await api.push([mutation]);
    const settled = result.acceptedMutationIds.length + result.conflicts.length;
    if (settled > 1) throw new Error('sync_push_single_mutation_settled_multiple_times');
    acceptedMutationIds.push(...result.acceptedMutationIds);
    conflicts.push(...result.conflicts);
    if (settled === 0 || result.conflicts.length > 0) break;
  }

  return { acceptedMutationIds, conflicts };
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

  async function completeMission(
    occurrenceId: string,
    input: CompleteMissionRequest,
  ): Promise<CompleteMissionResult> {
    const id = uuidSchema.parse(occurrenceId);
    const completion = completeMissionRequestSchema.parse(input);
    return completeMissionResultSchema.parse(
      await request(`/v1/missions/${encodeURIComponent(id)}/complete`, 'POST', completion),
    );
  }

  async function pushOrdinaryMutations(
    mutations: readonly SyncMutationContract[],
  ): Promise<SyncPushResponse> {
    const requestBody = syncPushRequestSchema.parse({ mutations });
    return syncPushResponseSchema.parse(await request('/v1/sync/push', 'POST', requestBody));
  }

  const api: AuthenticatedSyncApi = {
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

    completeMission,

    async push(mutations) {
      return pushQueuedMutationsWithCompletions(
        { completeMission, push: pushOrdinaryMutations },
        mutations,
      );
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

  return api;
}
